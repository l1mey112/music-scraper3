import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { YoutubeChannel, YoutubeVideo } from "../types"
import { run_with_concurrency_limit } from "../pass"
import { ProgressRef } from "../server"

// much slower, but we need the URLs
async function meta_youtube_channel(channel_id: string): Promise<YoutubeChannel> {
	const resp = await fetch(`https://yt.lemnoslife.com/channels?part=snippet,about&id=${channel_id}`)
	const json = await resp.json() as any
	const inner = json.items[0]

	// trim the fat
	delete inner.about.stats
	for (const link of inner.about.links) {
		delete link.favicon
	}

	return {
		about: inner.about,
		images: inner.snippet,
	}
}

// https://github.com/mattwright324/youtube-metadata
const default_key = atob('QUl6YVN5QVNUTVFjay1qdHRGOHF5OXJ0RW50MUh5RVl3NUFtaEU4')

// magnitudes faster
async function meta_youtube_video(video_id: string): Promise<YoutubeVideo> {
	// their API is sloooowww
	//const resp = await fetch(`https://yt.lemnoslife.com/noKey/videos?id=${video_id}&part=snippet`, {
	const resp = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${default_key}&id=${video_id}&part=snippet`, {
		headers: {
			"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			"Referer": "https://mattw.io/",
		}
	})

	const json = await resp.json() as any
	const inner = json.items[0]
	return inner.snippet
}

// TODO: use later
function youtube_id_from_url(video_url: string): string | undefined {
	const regex =  [
		/(?:http[s]?:\/\/)?(?:\w+\.)?youtube.com\/watch\?v=([\w_-]+)(?:[\/&].*)?/i,
		/(?:http[s]?:\/\/)?(?:\w+\.)?youtube.com\/(?:v|embed|shorts|video|watch|live)\/([\w_-]+)(?:[\/&].*)?/i,
		/(?:http[s]?:\/\/)?youtu.be\/([\w_-]+)(?:\?.*)?/i,
		/(?:http[s]?:\/\/)?filmot.com\/video\/([\w_-]+)(?:[?\/&].*)?/i,
		/(?:http[s]?:\/\/)?filmot.com\/sidebyside\/([\w_-]+)(?:[?\/&].*)?/i,
		/^([\w-]{11})$/i
	]

	for (const pattern of regex) {
		const match = video_url.match(pattern)
		if (match && match[1]) {
			return match[1]
		}
	}

	return undefined
}

// youtube_video.meta.youtube_video
export async function pass_youtube_video_meta_youtube_video() {
	await Bun.sleep(100)

	const k = db.select({ id: schema.youtube_video.id })
		.from(schema.youtube_video)
		.where(sql`meta_youtube_video is null`)
		.all()

	const pc = new ProgressRef('youtube_video.meta.youtube_video')

	let i = 0
	for (const { id } of k) {
		pc.emit(i / k.length * 100)
		const meta =  await meta_youtube_video(id)

		db.update(schema.youtube_video)
			.set({ meta_youtube_video: meta })
			.where(sql`id = ${id}`)
			.run()

		await Bun.sleep(100)
		i++
	}

	pc.close()

	return k.length > 0
}

// youtube_channel.extrapolate.youtube_video
export async function pass_youtube_channel_extrapolate_youtube_video() {
	await Bun.sleep(100)

	let updated = 0
	const k = db.select({ meta_youtube_video: schema.youtube_video.meta_youtube_video })
		.from(schema.youtube_video)
		.where(sql`meta_youtube_video is not null`)
		.all()

	const pc = new ProgressRef('youtube_channel.extrapolate.youtube_video')

	// TODO: construct set of channel ids to add all at once

	let i = 0
	for (const { meta_youtube_video } of k) {
		pc.emit(i / k.length * 100)
		const channel_id = meta_youtube_video!.channelId

		try {
			// will throw if already exists
			db.insert(schema.youtube_channel)
				.values({ id: channel_id })
				.run()
			updated++
		} catch {
			// nothing
		}
		
		await Bun.sleep(100)
		i++
	}

	pc.close()

	return updated > 0
}

// youtube_channel.meta.youtube_channel
export async function pass_youtube_channel_meta_youtube_channel() {
	await Bun.sleep(100)

	const k = db.select({ id: schema.youtube_channel.id })
		.from(schema.youtube_channel)
		.where(sql`meta_youtube_channel is null`)
		.all()

	const pc = new ProgressRef('youtube_channel.meta.youtube_channel')

	let i = 0
	for (const { id } of k) {
		pc.emit(i / k.length * 100)
		const channel = await meta_youtube_channel(id)

		db.update(schema.youtube_channel)
			.set({ meta_youtube_channel: channel })
			.where(sql`id = ${id}`)
			.run()

		await Bun.sleep(100)
		i++
	}
	
	pc.close()

	return k.length > 0
}
