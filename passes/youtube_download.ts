import { sql } from "drizzle-orm"
import { db, db_ident_pk_with } from "../db"
import { $youtube_video, $sources } from '../schema'
import { db_backoff_forever, db_backoff_sql, run_with_concurrency_limit } from "../util"
import { ProgressRef } from "../server"
import { FSRef, Ident } from "../types"
import * as YTDlpWrap from "yt-dlp-wrap";
import { db_fs_sharded_path_noext_nonlazy } from "../db_misc"

// sources.download.from_youtube_video_ytdlp
export async function pass_sources_download_from_youtube_video_ytdlp() {
	const DIDENT = 'sources.download.from_youtube_video_ytdlp'

	// backoff only when request failed
	
	let updated = false
	const k = db.select({ id: $youtube_video.id })
		.from($youtube_video)
		.where(sql`('yv/' || ${$youtube_video.id}) not in (select ${$sources.ident} from ${$sources})
			and ${db_backoff_sql(DIDENT, $youtube_video, $youtube_video.id)}`)
		.all()

	if (k.length == 0) {
		return false
	}

	const ytdl = new YTDlpWrap.default()
	const pc = new ProgressRef('sources.download.from_youtube_video_ytdlp')

	// this shouldn't fail, its assumed that the youtube_video table doesn't contain invalid ids
	await run_with_concurrency_limit(k, 20, pc, async ({ id }) => {
		const ident = db_ident_pk_with($youtube_video, id)
		const [path, hash_part] = db_fs_sharded_path_noext_nonlazy()

		type Output = {
			ext: string
			width: number
			height: number
			duration: number
			bitrate: number
		}

		const args = [
			"-f",
			"bestvideo+bestaudio/best",
			`https://www.youtube.com/watch?v=${id}`,
			"-o",
			path + ".%(ext)s",
			"--no-simulate",
			"--print",
			"{\"ext\":%(ext)j,\"width\":%(width)j,\"height\":%(height)j,\"duration\":%(duration)j,\"bitrate\":%(abr)j}",
		]

		let output_s
		try {
			output_s = await ytdl.execPromise(args)
		} catch {
			db_backoff_forever(DIDENT, ident)
			return
		}

		const output: Output = JSON.parse(output_s)
		const hash = (hash_part + '.' + output.ext) as FSRef

		db.insert($sources)
			.values({
				hash,
				ident,
				width: output.width,
				height: output.height,
				bitrate: output.bitrate,
			})
			.run()
		
		updated = true
	})

	pc.close()

	return updated
}
