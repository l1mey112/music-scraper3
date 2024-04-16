import { sql } from "drizzle-orm";
import { db, ident_pk, ident_pk_reverse, sqlite } from "../db";
import { $links, $sources, $spotify_track, $track, $vocadb_song, $youtube_video } from "../schema";
import { FSRef, Ident, LinkKind, NullMit, TrackId, VocaDBSongId } from "../types";
import { assert } from "../util";
import { SQLiteTable } from "drizzle-orm/sqlite-core";

type SourceIdent = {
	isrc?: string
	vocadb_id?: VocaDBSongId
}

type Source = SourceIdent & {
	hash: FSRef
	ident: Ident
	duration_s: number
}

type SourceMatch = SourceIdent & {
	track_id: TrackId
}

// with a mostly untyped query, its really annoying to have to get around drizzle
// drizzle doesn't have a bare `prepare()` api like `get()` and `all()`
// so we have to use `sqlite.prepare()`

// QUERY PLAN
// |--SEARCH sources USING PRIMARY KEY (hash=?)
// |--SEARCH t USING COVERING INDEX sources.audio_fingerprint.idx (duration_s>? AND duration_s<?)
// `--USE TEMP B-TREE FOR ORDER BY
const match_hash = sqlite.prepare<{ hash: FSRef, score: number }, [FSRef]>(`
	select t.hash, acoustid_compare2(t.chromaprint, target.chromaprint, 80) as score from
		sources t,
		(select hash, chromaprint, duration_s from sources where hash = ?) target
	where
		t.track_id not null and t.chromaprint not null and t.hash != target.hash
		and unlikely(score > 0.75)
		and t.duration_s between target.duration_s - 7 and target.duration_s + 7
	order by score desc
`)

// return a list of scores for a given FSRef matching to all in a track

// QUERY PLAN
// |--SCAN t USING INDEX sources.idx
// `--SEARCH sources USING PRIMARY KEY (hash=?)
const track_hash = sqlite.prepare<{ duration_s: number, score: number }, [FSRef, TrackId]>(`
	select t.duration_s, acoustid_compare2(t.chromaprint, target.chromaprint, 80) as score from
		sources t,
		(select chromaprint from sources where hash = ?) target
	where
		track_id = ?
`)

// track.classify.from_source_fingerprint
export function pass_track_classify_from_source_fingerprint() {
	let updated = false
	const k = db.select({ hash: $sources.hash })
		.from($sources)
		.where(sql`track_id is null and chromaprint is not null`)
		.all()

	const start_hashes = new Set<FSRef>(k.map((v) => v.hash))

	if (start_hashes.size === 0) {
		return
	}

	function classify(hash: FSRef) {
		const match = to_source(hash)
		const match_hashes = match_hash.all(hash)

		for (const { hash: target_hash } of match_hashes) {
			const target_match = to_source_match(target_hash)

			// stupid any casts...
			if (source_match(match, target_match)) {
				updated = true
				return // matched
			}
		}

		// doesn't match to anything, so we need to create a new track
		console.log('creating new track', hash)

		// create new track
		const { id: track_id } = db.insert($track)
			.values({})
			.returning()
			.get()

		set_track_id(match, track_id)
	}

	db.transaction(db => {
		for (const hash of start_hashes) {
			console.log('classifying', hash)
			classify(hash)
		}
	})

	return updated
}

function set_track_id(match: Source, track_id: TrackId) {
	const [id, table] = ident_pk_reverse(match.ident)

	// set track id
	db.update(table)
		.set({ track_id: track_id })
		.where(sql`id = ${id}`)
		.run()

	// set track id
	db.update($sources)
		.set({ track_id: track_id })
		.where(sql`${$sources.hash} = ${match.hash}`)
		.run()
}

// will also set the idents on the lhs (target)
function source_ident_match(lhs: SourceIdent, rhs: SourceIdent) {
	if (rhs.isrc) {
		if (!lhs.isrc) {
			lhs.isrc = rhs.isrc
		} else if (lhs.isrc !== rhs.isrc) {
			return false
		}
	}

	if (rhs.vocadb_id) {
		if (!lhs.vocadb_id) {
			lhs.vocadb_id = rhs.vocadb_id
		} else if (lhs.vocadb_id !== rhs.vocadb_id) {
			return false
		}
	}

	return true
}

function source_match(lhs: Source, rhs: SourceMatch) {
	if (!source_ident_match(lhs, rhs)) {
		console.log('not matching by idents', lhs, rhs)
		return false
	}

	const scores = track_hash.all(lhs.hash, rhs.track_id)

	for (const { score, duration_s } of scores) {
		// needs to match group score (>40%)
		if (score < 0.4) {
			console.log('not matching by score', lhs, rhs, score)
			return false
		}
		// needs to match duration
		if (Math.abs(lhs.duration_s - duration_s) > 7) {
			console.log('not matching by duration', lhs, rhs)
			return false
		}
	}

	// no more checking to be done, these are matching!
	console.log('matching', lhs, rhs)

	set_track_id(lhs, rhs.track_id)

	return true
}

function splice_ident_source_match(match: SourceIdent, insert: typeof $sources.$inferInsert) {
	const [id, table] = ident_pk_reverse(insert.ident)

	switch (table) {
		case $spotify_track: {
			const k = db.select({ isrc: $spotify_track.spotify_isrc })
				.from($spotify_track)
				.where(sql`${$spotify_track.id} = ${id}`)
				.get()!

			if (k.isrc) {
				if (!match.isrc) {
					match.isrc = k.isrc
				} else if (match.isrc !== k.isrc) {
					// not matching
					return
				}
			}
			break
		}
		case $vocadb_song: {
			if (!match.vocadb_id) {
				match.vocadb_id = id as VocaDBSongId
			} else if (match.vocadb_id !== id as VocaDBSongId) {
				// not matching
				return
			}
			break
		}
	}
}

function to_source(hash: FSRef): Source {
	const match: Partial<Source> = {}

	const k = db.select()
		.from($sources)
		.where(sql`${$sources.hash} = ${hash}`)
		.get()!

	splice_ident_source_match(match, k)
	match.duration_s = k.duration_s!
	match.hash = hash
	match.ident = k.ident

	return match as Source
}

function to_source_match(hash: FSRef): SourceMatch {
	const match: Partial<SourceMatch> = {}

	function classify(insert: typeof $sources.$inferInsert) {
		splice_ident_source_match(match, insert)
	}

	const k = db.select()
		.from($sources)
		.where(sql`${$sources.hash} = ${hash}`)
		.get()!

	if (k.track_id) {
		// select all that are related to this track
		match.track_id = k.track_id

		const g = db.select()
			.from($sources)
			.where(sql`${$sources.track_id} = ${k.track_id}`)
			.all()

		for (const v of g) {
			classify(v)
		}
	} else {
		classify(k)
	}

	return match as SourceMatch
}

// track.classify.from_other_tracks
export async function pass_track_classify_from_other_tracks() {
	// vocadb and other places can't be classified as they don't have downloadable sources

	const valid_tables = [
		$vocadb_song,
	]

	const tables_with_tracks = new Map<LinkKind, SQLiteTable>([
		['sp_track_id', $spotify_track],
		['yt_video_id', $youtube_video],
	])

	let updated = false

	// select all vocadb songs without a track id
	// select all in tables_with_tracks that have a link from vocadb song -> them
	// assign their track id to the vocadb song

	function sql_valid_link_kinds() {
		return sql.raw('(' + [...tables_with_tracks.keys()].map(t => `'${t}'`).join(', ') + ')')
	}

	function classify(table: SQLiteTable) {
		const k = db.select({ id: sql<TrackId>`id` })
			.from(table)
			.where(sql`track_id is null`)
			.all()

		next: for (const { id } of k) {
			const ident = ident_pk(table, id)
			const links = db.select()
				.from($links)
				.where(sql`ident = ${ident} and kind in ${sql_valid_link_kinds()}`)
				.all()

			for (const { kind, data } of links) {
				const target_table = tables_with_tracks.get(kind)!

				const target = db.select({ track_id: sql<TrackId | null>`track_id` })
					.from(target_table)
					.where(sql`id = ${data}`)
					.get()

				if (!target || !target.track_id) {
					continue
				}

				console.log('assigning track id', ident, target.track_id)

				// set track id
				db.update(table)
					.set({ track_id: target.track_id })
					.where(sql`id = ${id}`)
					.run()

				updated = true
				continue next
			}

			console.log('no track id found for', ident)
		}
	}

	db.transaction(db => {
		for (const table of valid_tables) {
			classify(table)
		}
	})

	return updated
}
