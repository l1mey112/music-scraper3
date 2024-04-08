import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { ProgressRef } from "../server"
import { run_with_concurrency_limit, run_with_throughput_limit } from "../pass"
import { $ } from 'bun'
import { db_backoff_sql, db_fs_hash_path, db_backoff } from "../db_misc"

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
		const fpcalc = await $`fpcalc -algorithm 2 -raw -json ${db_fs_hash_path(hash)}`.quiet()

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

		// acoustid API only supports integer durations, but fpcalc returns float durations ???
		
		db.update(schema.sources)
			.set({ chromaprint: new Uint8Array(fingerprint.buffer) })
			.where(sql`${schema.sources.hash} = ${hash}`)
			.run()
	})

	pc.close()

	return false
}

// sources.classify.yv_chromaprint_to_acoustid
/* export async function pass_sources_classify_yv_chromaprint_to_acoustid() {
	const k = db.select({ hash: schema.sources.hash, chromaprint: schema.sources.chromaprint, chromaprint_duration: schema.sources.chromaprint_duration })
		.from(schema.sources)
		.where(sql`${schema.sources.chromaprint} is not null and ${schema.sources.chromaprint_duration} is not null and ${schema.sources.ident} like 'yv/%'
			and ${schema.sources.acoustid} is null
			and ${db_backoff_sql(schema.sources, schema.sources.hash, 'sources.classify.yv_chromaprint_to_acoustid')}`)
		.all()

	if (k.length == 0) {
		return false
	}

	// acoustid supports 3 requests per second

	// https://api.acoustid.org/v2/lookup?client=cQHaCstP-AY (demonstration client id, sorry!)
	//     &meta=recordings+recordingids+releases+releaseids+releasegroups+releasegroupids+tracks+compress+usermeta+sources (everything on it)
	//     &duration=<DURATION> (reported by fpcalc)
	//     &fingerprint=<FINGERPRINT>

	let updated = false
	const pc = new ProgressRef('sources.classify.chromaprint')

	await run_with_throughput_limit(k, 3, 1000, pc, async ({ hash, chromaprint, chromaprint_duration }) => {
		const meta = 'recordings+recordingids+releases+releaseids+releasegroups+releasegroupids+tracks+compress+usermeta+sources'
		const resp = await fetch(`https://api.acoustid.org/v2/lookup?client=cQHaCstP-AY&meta=${meta}&duration=${chromaprint_duration!}&fingerprint=${chromaprint!}`)

		if (!resp.ok) {
			console.log(resp.status, await resp.text(), resp.url)
			throw new Error(`acoustid lookup failed: ${resp.status}`)
		}

		const json = await resp.json() as AcoustIdRoot

		if (json.status !== 'ok') {
			throw new Error(`acoustid lookup failed: ${json.status}`)
		}

		// no match
		const res = json.results[0]
		if (!res || res.score < 0.65) {
			db_register_backoff(schema.sources, hash, 'sources.classify.yv_chromaprint_to_acoustid')
			return
		}

		db.update(schema.sources)
			.set({ acoustid: res.id })
			.where(sql`${schema.sources.hash} = ${hash}`)
			.run()

		// can return multiple results or zero results
		updated = true
	})

	pc.close()

	return updated
}

// ordered by most likely to least likely (score is 0-1)
type AcoustIdRoot = {
	results: Array<{
		id: string // AcoustID
		recordings: Array<{
			id: string // MBID
			releasegroups: Array<{
				id: string // MBID
				releases: Array<{
					id: string // MBID
					mediums: Array<{
						format: string
						position: number
						track_count: number
						tracks: Array<{
							artists: Array<{
								id: string
								name: string
								joinphrase?: string
							}>
							id: string // MBID
							position: number
							title: string
						}>
					}>
				}>
			}>
			sources: number
		}>
		score: number
	}>
	status: string
} */
