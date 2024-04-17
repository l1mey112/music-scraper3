import { SQLiteTable } from "drizzle-orm/sqlite-core"
import { AlbumId, ArtistId, FSRef, Ident, TrackId } from "../types"
import { db, ident_pk } from "../db"
import { sql } from "drizzle-orm"
import { $sources, $spotify_track, $track, $vocadb_song, $youtube_video } from "../schema"
import { pick_best_locale_name } from "./meta_artist"

type TrackIdToCol<T extends TrackId | AlbumId | ArtistId> = T extends TrackId
	? 'track_id' : T extends AlbumId
	? 'album_id'
	: 'artist_id'

export function extract_idents<T extends TrackId | AlbumId | ArtistId>(id: T, column: TrackIdToCol<T>, order: SQLiteTable[]): Ident[] {
	const idents: Ident[] = []

	for (const meta_table of order) {
		const meta = db.select({ id: sql<string | number>`id` })
			.from(meta_table)
			.where(sql`${sql.raw(column)} = ${id}`)
			.get()

		if (!meta) {
			continue
		}

		const ident = ident_pk(meta_table, meta.id)
		
		if (idents.includes(ident)) {
			continue
		}

		idents.push(ident)
	}

	return idents
}

function construct_sources(track_id: TrackId): FSRef | undefined {
	// select sources with greatest bitrate
	const k = db.select({ hash: $sources.hash })
		.from($sources)
		.where(sql`track_id = ${track_id}`)
		.orderBy(sql`bitrate desc`)
		.limit(1)
		.get()

	if (!k) {
		return
	}

	return k.hash
}

// track.meta.assign
export function pass_track_meta_assign() {
	let updated = false

	const k = db.select({ id: $track.id })
		.from($track)
		.where(sql`name is null or audio_source is null`)
		.all()

	function classify(track_id: TrackId) {
		const idents = extract_idents(track_id, 'track_id', [
			$youtube_video,
			$spotify_track,
			$vocadb_song,
		])
		
		// in specific order for this function
		// order doesn't matter elsewhere
		const name = pick_best_locale_name(idents)

		if (!name) {
			return
		}

		const source = construct_sources(track_id)

		if (!source) {
			return
		}

		db.update($track)
			.set({
				name: name,
				audio_source: source,
			})
			.where(sql`id = ${track_id}`)
			.run()

		updated = true
	}

	for (const { id } of k) {
		classify(id)
	}

	return updated
}
