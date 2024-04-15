import { sql } from "drizzle-orm";
import { db, db_ident_pk_with } from "../db";
import { $sources, $spotify_track } from "../schema";
import { ProgressRef } from "../server";
import { zotify_credentials } from "../cred_api";
import { db_backoff_forever, db_backoff_sql, run_with_concurrency_limit } from "../util";
import { $ } from 'bun'
import { db_fs_sharded_path_noext_nonlazy } from "../db_misc";
import { dirname, basename } from 'path'
import { FSRef } from "../types";

// sources.download.from_spotify_track_zotify
export async function pass_sources_download_from_youtube_video_zotify() {
	const DIDENT = 'sources.download.from_spotify_track_zotify'
	
	let updated = false
	const k = db.select({ id: $spotify_track.id })
		.from($spotify_track)
		.where(sql`('st/' || ${$spotify_track.id}) not in (select ${$sources.ident} from ${$sources})
			and ${db_backoff_sql(DIDENT, $spotify_track, $spotify_track.id)}`)
		.all()

	if (k.length == 0) {
		return false
	}

	const [username, password] = zotify_credentials()
	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 20, pc, async ({ id }) => {
		const ident = db_ident_pk_with($spotify_track, id)
		const [path, hash_part] = db_fs_sharded_path_noext_nonlazy()

		const folder = dirname(path)
		const file = basename(path)

		try {
			// 160kbps (highest for free users)
			await $`zotify --download-quality high --print-progress-info False --download-lyrics False --download-format ogg --root-path ${folder} --username ${username} --password ${password} --output ${file + '.ogg'} ${'https://open.spotify.com/track/' + id}`
		} catch {
			db_backoff_forever(DIDENT, ident)
			return
		}

		const hash = (hash_part + '.ogg') as FSRef

		db.insert($sources)
			.values({
				hash,
				ident,
				bitrate: 160000, // 160kbps
			})
			.run()

		updated = true
	})

	pc.close()

	return updated
}
