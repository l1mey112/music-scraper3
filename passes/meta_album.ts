import { SQLiteTable } from "drizzle-orm/sqlite-core"
import { AlbumId, FSRef, Ident } from "../types"
import { db, ident_pk } from "../db"
import { sql } from "drizzle-orm"
import { $album, $spotify_album, $vocadb_album } from "../schema"
import { extract_idents } from "./meta_track"
import { pick_best_image_kind, pick_best_locale_name } from "./meta_artist"

// album.meta.assign
export function pass_album_meta_assign() {
	let updated = false
	const k = db.select({ id: $album.id })
		.from($album)
		.where(sql`name is null or cover_image is null`)
		.all()

	if (k.length === 0) {
		return false
	}

	// TODO: should really put all of the *.meta.assign and merge into *.classify.auto
	//       its getting repetitive to put extract idents

	function classify(album_id: AlbumId) {
		const idents = extract_idents(album_id, 'album_id', [
			$spotify_album,
			$vocadb_album,
		])

		// in specific order for this function
		// order doesn't matter elsewhere
		const name = pick_best_locale_name(idents)

		if (!name) {
			return
		}

		const cover_hash = pick_best_image_kind(idents, 'cover_art')

		if (!cover_hash) {
			return
		}

		// TODO: should have done a `primary_artist` though this isn't really
		//       a universal thing, though common.

		db.update($album)
			.set({ name, cover_image: cover_hash })
			.where(sql`id = ${album_id}`)
			.run()
		
		updated = true
	}

	for (const { id } of k) {
		classify(id)
	}

	return updated
}