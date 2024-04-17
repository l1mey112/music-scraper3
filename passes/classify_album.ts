import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { $album, $album_tracks, $spotify_album, $spotify_track, $vocadb_album, $vocadb_song } from "../schema";
import { Ident, KV, LinkKind, TrackId } from "../types";
import { table_column_null, table_link_walker } from "./classify_artist";
import { sql } from "drizzle-orm";
import { db, ident_pk_reverse } from "../db";

// album.classify.auto
export function pass_album_classify_auto() {
	const valid_search_tables: KV<LinkKind, SQLiteTable> = {
		sp_album_id: $spotify_album,
		vd_album_id: $vocadb_album,
	}
	
	const start_idents = table_column_null(Object.values(valid_search_tables), sql`album_id`)

	// none today
	if (start_idents.size === 0) {
		return false
	}

	let updated = false

	db.transaction(() => {
		updated = table_link_walker(start_idents, valid_search_tables, [], unify)
	})

	return updated
}

function unify(together: Iterable<Ident>) {
	// disc:track
	type TrackDisc = `${string}/${string}`

	// sometimes, a vocadb album entry will have omitted tracks.

	// its part of the code, when that track in the album doesn't
	// have a vocadb entry, it doesn't include it in the track list.

	// will need to mesh the two together

	const mapping = new Map<TrackDisc, TrackId>()

	for (const ident of together) {
		const [data, table] = ident_pk_reverse(ident)

		// different tables have different ways of encoding album -> track relationships

		switch (table) {
			case $vocadb_album: {
				const k = db.select({ vocadb_tracks: $vocadb_album.vocadb_tracks })
					.from($vocadb_album)
					.where(sql`id = ${data} and vocadb_tracks is not null`)
					.get()

				if (!k) {
					continue
				}

				for (const { disc, i, id: vocadb_song_id } of k.vocadb_tracks!) {
					// find track id from vocadb_song_id

					const k = db.select({ track_id: $vocadb_song.track_id })
						.from($vocadb_song)
						.where(sql`id = ${vocadb_song_id} and track_id is not null`)
						.get()
					
					if (!k) {
						continue
					}

					mapping.set(`${disc}/${i}`, k.track_id!)
				}
				break
			}
			case $spotify_album: {
				const k = db.select({ track_id: $spotify_track.track_id, spotify_disc_number: $spotify_track.spotify_disc_number, spotify_track_number: $spotify_track.spotify_track_number })
					.from($spotify_track)
					.where(sql`spotify_album_id = ${data} and track_id not null`)
					.all()

				for (const { track_id, spotify_disc_number, spotify_track_number } of k) {
					mapping.set(`${spotify_disc_number}/${spotify_track_number}`, track_id!)
				}
				break
			}
		}
	}

	// TODO: should i check for track count and verify? probably.
	// TODO: no chance to merge with other artists, though even this is super shoddy...

	// update album with track ids

	const { id: album_id } = db.insert($album)
		.values({})
		.returning()
		.get()

	for (const [disc_track, track_id] of mapping) {
		const [disc, track] = disc_track.split('/')

		console.log(`adding track ${track_id} (${track}, disc ${disc}) to album ${album_id}`)

		db.insert($album_tracks)
			.values({
				album_id,
				track_id,
				disc: parseInt(disc),
				i: parseInt(track),
			})
			.run()
	}

	for (const ident of together) {
		const [data, table] = ident_pk_reverse(ident)

		console.log(`updating ${ident} to ${album_id}`)

		db.update(table)
			.set({ album_id })
			.where(sql`id = ${data}`)
			.run()
	}
}
