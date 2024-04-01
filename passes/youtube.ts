import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { run_with_concurrency_limit } from "../pass"
import { ProgressRef } from "../server"

// much slower, but we need the URLs
export async function meta_youtube_channel(channel_id: string): Promise<YoutubeChannel> {
	const resp = await fetch(`https://yt.lemnoslife.com/channels?part=snippet,about&id=${channel_id}`)
	const json = await resp.json() as any
	console.log(JSON.stringify(json))
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

	const url_regex = /(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?/ig

	const k = db.select({ id: schema.youtube_video.id })
		.from(schema.youtube_video)
		.where(sql`meta_youtube_video is null`)
		.all()

	const pc = new ProgressRef('youtube_video.meta.youtube_video')

	await run_with_concurrency_limit(k, 5, pc, async ({ id }) => {
		const meta = await meta_youtube_video(id)
		const url_set = new Set<string>()

		// extract all URLs from the description
		for (const url of meta.description.matchAll(url_regex)) {
			url_set.add(url[0])
		}

		db.update(schema.youtube_video)
			.set({
				name: meta.title,
				description: meta.description,
				channel_id: meta.channelId,
				description_links: Array.from(url_set),
			})
			.where(sql`id = ${id}`)
			.run()
	})

	pc.close()

	return k.length > 0
}

// youtube_channel.extrapolate.channel_id
// no need for async, its an instant operation
export function pass_youtube_channel_extrapolate_channel_id() {
	let updated = 0
	const k = db.select({ channel_id: schema.youtube_video.channel_id })
		.from(schema.youtube_video)
		.where(sql`channel_id is not null`)
		.all()

	const channel_ids = new Set<string>(k.map(({ channel_id }) => channel_id!))

	for (const channel_id of channel_ids) {
		try {
			// will throw if already exists
			db.insert(schema.youtube_channel)
				.values({ id: channel_id })
				.run()
			updated++
		} catch {
			// nothing
		}		
	}

	return updated > 0
}

// youtube_channel.meta.youtube_channel
export async function pass_youtube_channel_meta_youtube_channel() {
	/* const k = db.select({ id: schema.youtube_channel.id })
		.from(schema.youtube_channel)
		.where(sql`meta_youtube_channel is null`)
		.all()

	const pc = new ProgressRef('youtube_channel.meta.youtube_channel')

	await run_with_concurrency_limit(k, 5, pc, async ({ id }) => {
		const channel = await meta_youtube_channel(id)

		db.update(schema.youtube_channel)
			.set({
				handle: channel.about.handle,
				name: channel.about.,
				description: channel.about.description,
				links: channel.about.links.map(({ url }) => url),
			})
			.where(sql`id = ${id}`)
			.run()
	})

	pc.close()

	return k.length > 0 */
}

type YoutubeImage = {
	url: string
	width: number
	height: number
}

type YoutubeChannelAboutLink = {
	url: string   // "https://open.spotify.com/artist/3b7jPCedJ2VH4l4rcOTvNC"
	title: string // "Spotify"
	// ignore favicons, they're huge wastes of space
	// favicon: { url: string, width: number, height: number }[]
}

type YoutubeChannelAbout = {
	// ignore stats, no point keeping them
	/* stats: {
		joinedDate: number
		viewCount: number
		subscriberCount: number
		videoCount: number
	} */
	description: string
	details: {
		location: string
	}
	links: YoutubeChannelAboutLink[]
	handle: string // @pinocchiop
}

type YoutubeChannelSnippet = {
	avatar: YoutubeImage[]
	banner: YoutubeImage[]
	tvBanner: YoutubeImage[]
	mobileBanner: YoutubeImage[]
}

type YoutubeChannel = {
	about: YoutubeChannelAbout
	images: YoutubeChannelSnippet
}

type YoutubeVideo = {
	publishedAt: string
	channelId: string
	title: string
	description: string
	thumbnails: {
		[key: string]: YoutubeImage // key being "default" | "medium" | "high" | "standard" | "maxres" | ...
	}
	channelTitle: string
	tags: string[]
	categoryId: string
	liveBroadcastContent: string
	localized: {
		title: string
		description: string
	}
}
