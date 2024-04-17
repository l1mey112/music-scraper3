import { sql } from "drizzle-orm";
import { db } from "../db";
import { $album, $album_tracks, $artist, $track } from "../schema";
import { AlbumId, FSRef, TrackId } from "../types";
import { $ } from "bun";
import { run_with_concurrency_limit } from "../util";
import { ProgressRef } from "../server";
import { fs_hash_path, fs_sharded_path_nonlazy } from "../db_misc";

type TagTarget = {
	album_id: AlbumId
	track_id: TrackId
	disc: number
	i: number

	cover_image: FSRef
	audio_source: FSRef

	track_name: string
	album_name: string
	artist_names: string[]
}

async function tag_audio_source(target: TagTarget): Promise<boolean> {
	// the resultant source must be a shitty mp3 for the highest chance at interop
	// it also must have zero video

	// since we never generate mp3 files, only WEBMs, OGGs and MKVs, we always need to reencode
	// also ensure that the cover image isn't too big, make it 200x200

	const [path, hash] = fs_sharded_path_nonlazy('.mp3')

	try {
		/* await $`ffmpeg -i ${fs_hash_path(target.audio_source)} -i ${fs_hash_path(target.cover_image)}
			-c:v copy -map 0 -map 1 -id3v2_version 3 -write_id3v1 1
			-metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)"
			-metadata title="${target.track_name}"
			-metadata artist="${target.artist_names.join(', ')}"
			-metadata album="${target.album_name}"
			-metadata track="${target.i + 1}/${target.disc}"
			-y ${path}` */

		const args = [
			'-i', fs_hash_path(target.audio_source),
			'-i', fs_hash_path(target.cover_image),
			//'-vf', 'scale=400:400', // 400x400, black bars to 1:1 aspect ratio, not too big
			//'-c:v', 'libx264',
			'-c:v', 'copy',
			'-map', '0',
			'-map', '1',
			'-id3v2_version', '3',
			'-write_id3v1', '1',
			'-metadata:s:v', 'title=Album cover',
			'-metadata:s:v', 'comment=Cover (front)',
			'-metadata', `title=${target.track_name}`,
			'-metadata', `artist=${target.artist_names.join(', ')}`,
			'-metadata', `album=${target.album_name}`,
			'-metadata', `track=${target.i + 1}/${target.disc}`,
			'-y', path
		]

		const proc = Bun.spawn(['ffmpeg', ...args], {
			stderr: 'pipe',
			stdout: 'pipe',
		})
		await proc.exited

		if (proc.exitCode !== 0) {
			throw new Error(`ffmpeg exited with code ${proc.exitCode}, stderr: ${await new Response(proc.stderr).text()}`)
		}
	} catch (e) {
		console.error(`failed to tag audio source for album ${target.album_name} (id: ${target.album_id}) and track ${target.track_name} (id: ${target.track_id})`)
		console.error(e)
		return false
	}

	console.log(`tagged audio source for album ${target.album_name} (id: ${target.album_id}) and track ${target.track_name} (id: ${target.track_id}), hash: ${hash}`)

	db.update($album_tracks)
		.set({ tagged_audio_source: hash })
		.where(sql`album_id = ${target.album_id} and track_id = ${target.track_id}`)
		.run()

	return true
}

// track.tag.tag_track_to_album
export async function pass_track_tag_finalise_track_to_album() {
	const DIDENT = 'track.tag.tag_track_to_album'
	
	let updated = false
	const k = db.select()
		.from($album_tracks)
		.where(sql`tagged_audio_source is null`)
		.all()

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 8, pc, async ({ track_id, album_id, disc, i }) => {
		const track = db.select()
			.from($track)
			.where(sql`id = ${track_id} and artists is not null and audio_source is not null and name is not null`)
			.get()!

		const album = db.select()
			.from($album)
			.where(sql`id = ${album_id}`)
			.get()!

		const artist_names = []

		for (const artist_id of track.artists!) {
			const artist = db.select({ name: $artist.name })
				.from($artist)
				.where(sql`id = ${artist_id}`)
				.get()!

			artist_names.push(artist.name!)
		}

		const target: TagTarget = {
			album_id,
			track_id,
			disc,
			i,

			cover_image: album.cover_image!,
			audio_source: track.audio_source!,

			track_name: track.name!,
			album_name: album.name!,
			artist_names,
		}

		if (await tag_audio_source(target)) {
			updated = true
		}
	})

	pc.close()

	return updated
}
