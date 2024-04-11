import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { ProgressRef } from "../server"
import { run_with_concurrency_limit, run_with_throughput_limit } from "../pass"
import { $ } from 'bun'
import { db_backoff_sql, db_fs_hash_path, db_backoff, Backoff } from "../db_misc"

const fingerprint_intern = db.select({  })


// sources.classify.audio_fingerprint
export async function pass_sources_classify_audio_fingerprint() {
	const DIDENT = 'sources.classify.audio_fingerprint'

	// will issue backoffs for fingerprints that don't match criteria
	
	const k = db.select({ hash: schema.sources.hash })
		.from(schema.sources)
		.where(sql`${schema.sources.fingerprint} is null and ${db_backoff_sql(schema.sources, schema.sources.ident, DIDENT)}`)
		.all()
	
	if (k.length == 0) {
		return false
	}

	const pc = new ProgressRef('sources.classify.audio_fingerprint')

	await run_with_concurrency_limit(k, 10, pc, async ({ hash }) => {
		const fpcalc = await $`fpcalc -algorithm 2 -length 180 -raw -json ${db_fs_hash_path(hash)}`.quiet()

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

		// https://wiki.musicbrainz.org/Guides/AcoustID

		// accuracy diminishes below 25 seconds (reported 15-30, intuition 20, meet in the middle of 25)
		// at least 80 unique items
		if (json.duration < 25 || new Set(fingerprint).size < 80) {
			db_backoff(schema.sources, hash, DIDENT, Backoff.Forever)
			return
		}

		// deduplicate, acoustids > 90% are the same

		/* db.update(schema.sources)
			.set({ chromaprint: new Uint8Array(fingerprint.buffer), duration_s: json.duration })
			.where(sql`${schema.sources.hash} = ${hash}`)
			.run() */
	})

	pc.close()

	return false
}

// acoustid API only supports integer durations, but fpcalc returns float durations ???

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
