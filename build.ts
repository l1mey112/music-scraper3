import { sql } from "drizzle-orm";
import { db } from "./db";
import { $album, $album_tracks, $track } from "./schema";
import { AlbumId, FSRef, TrackId } from "./types";
import fs from 'fs';
import { fs_hash_path } from "./db_misc";

export function build_tagged_album(root_wd: string, album_id: AlbumId): boolean {
	const album = db.select({ name: $album.name })
		.from($album)
		.where(sql`id = ${album_id} and name is not null`)
		.get()

	if (!album) {
		return false
	}

	const tracks = db.select({ track_id: $album_tracks.track_id, tagged_audio_source: $album_tracks.tagged_audio_source })
		.from($album_tracks)
		.where(sql`album_id = ${album_id} and tagged_audio_source is not null`)
		.all() as { track_id: TrackId, tagged_audio_source: FSRef }[]

	if (!tracks.length) {
		return false
	}

	const album_name = album.name!
	const album_wd = `${root_wd}/${album_name}`
	fs.mkdirSync(album_wd, { recursive: true })

	for (const track of tracks) {
		const { name: track_name } = db.select({ name: $track.name })
			.from($track)
			.where(sql`id = ${track.track_id} and name is not null`)
			.get()!

		const tagged_audio_source = Bun.file(fs_hash_path(track.tagged_audio_source))
		Bun.write(`${album_wd}/${track_name}.mp3`, tagged_audio_source)
	}
	
	return true
}
