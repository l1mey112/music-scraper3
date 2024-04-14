import { sql } from "drizzle-orm"
import { db } from "../db"
import { ProgressRef } from "../server"
import { $ } from 'bun'
import { db_backoff_forever, db_backoff_sql, run_with_concurrency_limit } from "../util"
import { $audio_fingerprint, $sources } from "../schema"
import { db_fs_hash_path } from "../db_misc"
import { Ident } from "../types"

// sources.classify.audio_fingerprint
export async function pass_sources_classify_audio_fingerprint() {
	const DIDENT = 'sources.classify.audio_fingerprint'

	// will issue backoffs for fingerprints that don't match criteria

	// could just issue a backoff for all fingerprints, but that will bloat the backoff table
	// just check for fingerprint is null, then assign backoffs to genuine failures

	let updated = false
	const k = db.select({ hash: $sources.hash })
		.from($sources)
		.where(sql`${$sources.fingerprint} is null and ${db_backoff_sql(DIDENT, $sources, $sources.hash)}`)
		.all()

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 10, pc, async ({ hash }) => {
		const ident = ('so/' + hash) as Ident

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
			db_backoff_forever(DIDENT, ident)
			return
		}

		db.transaction(db => {
			const g = db.insert($audio_fingerprint)
				.values({ chromaprint: new Uint8Array(fingerprint.buffer), duration_s: json.duration })
				.returning()
				.get()

			db.update($sources)
				.set({ fingerprint: g.id })
				.where(sql`${$sources.hash} = ${hash}`)
				.run()
		})

		updated = true
	})

	pc.close()

	return updated
}

// acoustid API only supports integer durations, but fpcalc returns float durations ???

// sources.classify.yv_chromaprint_to_acoustid
/* export async function pass_sources_classify_yv_chromaprint_to_acoustid() {
	const k = db.select({ hash: sources.hash, chromaprint: sources.chromaprint, chromaprint_duration: sources.chromaprint_duration })
		.from(sources)
		.where(sql`${sources.chromaprint} is not null and ${sources.chromaprint_duration} is not null and ${sources.ident} like 'yv/%'
			and ${sources.acoustid} is null
			and ${db_backoff_sql(sources, sources.hash, 'sources.classify.yv_chromaprint_to_acoustid')}`)
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
			db_register_backoff(sources, hash, 'sources.classify.yv_chromaprint_to_acoustid')
			return
		}

		db.update(sources)
			.set({ acoustid: res.id })
			.where(sql`${sources.hash} = ${hash}`)
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
