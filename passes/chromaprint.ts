import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { ProgressRef } from "../server"
import { run_with_concurrency_limit } from "../pass"
import { $ } from 'bun'
import { db_fs_hash_path } from "../db_misc"

// sources.classify.chromaprint
export async function pass_sources_classify_chromaprint() {
	const k = db.select({ hash: schema.sources.hash })
		.from(schema.sources)
		.where(sql`${schema.sources.chromaprint} is null`)
		.all()
	
	if (k.length == 0) {
		return false
	}

	const pc = new ProgressRef('sources.classify.chromaprint')

	await run_with_concurrency_limit(k, 10, pc, async ({ hash }) => {
		const fpcalc = await $`fpcalc -raw -json ${db_fs_hash_path(hash)}`.quiet()

		type FpCalc = {
			duration: number
			fingerprint: number[]
		}

		// rare
		if (fpcalc.exitCode !== 0) {
			throw new Error(`fpcalc failed: ${fpcalc.stderr}`)
		}

		const json: FpCalc = fpcalc.json()
		const fingerprint = new Uint32Array(json.fingerprint)

		db.update(schema.sources)
			.set({ chromaprint: new Uint8Array(fingerprint.buffer) })
			.where(sql`${schema.sources.hash} = ${hash}`)
			.run()
	})

	pc.close()

	return false
}