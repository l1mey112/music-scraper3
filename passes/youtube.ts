import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { run_with_concurrency_limit } from "../pass"
import { ProgressRef } from "../server"
import { db_links_append } from "./../db_misc"
import { db_images_append_url } from "./images"
import { ImageKind } from "../types"
import { links_from_text } from "./links"

export async function youtube_video_exists(id: string): Promise<boolean> {
	const req = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`)
	return req.status === 200
}

export async function youtube_channel_exists(id: string): Promise<boolean> {
	// no oembed test, need to request the channel

	const resp = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${default_key}&id=${id}`, {
		headers: {
			"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			"Referer": "https://mattw.io/",
		}
	})
	const json = await resp.json() as any

	return json.pageInfo.totalResults > 0
}

function largest_image(arr: Iterable<YoutubeImage>): YoutubeImage | undefined {
	let largest: YoutubeImage | undefined = undefined;

	for (const image of arr) {
		if (!largest || image.width * image.height > largest.width * largest.height) {
			largest = image;
		}
	}

	return largest;
}

// https://github.com/mattwright324/youtube-metadata
const default_key = atob('QUl6YVN5QVNUTVFjay1qdHRGOHF5OXJ0RW50MUh5RVl3NUFtaEU4')

// much slower, but we need the URLs
async function meta_youtube_channel(channel_id: string): Promise<YoutubeChannel> {
	const resp = await fetch(`https://yt4.lemnoslife.com/channels?part=snippet,about&id=${channel_id}`)
	if (!resp.ok) {
		throw new Error(`youtube channel req failed (id: ${channel_id})`)
	}
	const json = await resp.json() as any
	if (json.error?.message) {
		throw new Error(`youtube channel req failed (id: ${channel_id}): ${json.error.message}`)
	}
	if (json.items.length === 0) {
		throw new Error(`youtube channel req is empty (id: ${channel_id})`)
	}
	const inner = json.items[0]

	// trim the fat
	delete inner.about.stats
	for (const link of inner.about.links) {
		delete link.favicon
	}

	// lemnoslife doesn't provide display name
	// youtube v3 doesn't provide links

	//https://yt4.lemnoslife.com/noKey/channels?part=snippet&id=
	const yt_resp = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${default_key}&part=snippet&id=${channel_id}`, {
		headers: {
			"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			"Referer": "https://mattw.io/",
		}
	})
	const yt_json = await yt_resp.json() as any
	if (json.items.length === 0) {
		throw new Error(`youtube channel req is empty (id: ${channel_id})`)
	}

	return {
		about: inner.about,
		images: inner.snippet,
		display_name: yt_json.items[0].snippet.title
	}
}

// magnitudes faster
// cannot have more than 50 of these, assume they're in order???
async function meta_youtube_video(video_ids: string[]): Promise<YoutubeVideo[]> {
	if (video_ids.length > 50) {
		throw new Error(`youtube video req cannot have more than 50 ids (ids: ${video_ids.join(',')})`)
	}

	// their API is sloooowww
	//const resp = await fetch(`https://yt4.lemnoslife.com/noKey/videos?id=${video_id}&part=snippet`, {
	const resp = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${default_key}&id=${video_ids.join(',')}&part=snippet`, {
		headers: {
			"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			"Referer": "https://mattw.io/",
		}
	})

	const json = await resp.json() as any
	if (!resp.ok) {
		throw new Error(`youtube video req failed`)
	}
	if (json.pageInfo.totalResults != video_ids.length) {
		throw new Error(`youtube video req is missing all data`)
	}

	// https://developers.google.com/youtube/v3/docs/videos#resource
	return json.items.map((inner: any) => {
		inner.snippet.id = inner.id // attach id
		return inner.snippet
	})
}

export async function meta_youtube_handle_to_id(handle: string): Promise<string | undefined> {
	if (!handle.startsWith('@')) {
		throw new Error(`youtube handle must start with @ (idL: ${handle})`)
	}

	// could fetch `https://yt4.lemnoslife.com/channels?handle=@HANDLE` but that is slower than youtube v3
	const resp = await fetch(`https://www.googleapis.com/youtube/v3/channels?key=${default_key}&forHandle=${handle}&part=snippet`, {
		headers: {
			"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			"Referer": "https://mattw.io/",
		}
	})

	const json: any = await resp.json()
	if (json.pageInfo.totalResults === 0) {
		return undefined
	}

	return json.items[0].id
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
	const k = db.select({ id: schema.youtube_video.id })
		.from(schema.youtube_video)
		.where(sql`channel_id is null or name is null or description is null`)
		.all()

	if (k.length == 0) {
		return
	}

	const pc = new ProgressRef('youtube_video.meta.youtube_video')

	for (let offset = 0; offset < k.length; offset += 50) {
		const batch = k.slice(offset, offset + 50) // 50 is the maximum batch size
		const ids = batch.map(v => v.id)

		const videos = await meta_youtube_video(ids)

		for (let i = 0; i < batch.length; i++) {
			const meta = videos[i]

			// rare?
			if (batch[i].id != meta.id) {
				throw new Error(`youtube video meta mismatch (batch[].id: ${batch[i].id}, meta.id: ${meta.id})`)
			}
			
			const id = meta.id
			const thumb = largest_image(Object.values(meta.thumbnails))

			if (thumb) {
				db_images_append_url(schema.youtube_video, id, 'yt_thumbnail', thumb.url, thumb.width, thumb.height)
			}

			// extract all URLs from the description
			const url_set = links_from_text(meta.description)

			db.update(schema.youtube_video)
				.set({
					channel_id: meta.channelId,
					name: meta.title,
					description: meta.description,
				})
				.where(sql`id = ${id}`)
				.run()

			db_links_append(schema.youtube_video, id, Array.from(url_set))
		}
	}

	pc.close()

	return true
}

// youtube_channel.extrapolate.from_channel_id
// no need for async, its an instant operation
export function pass_youtube_channel_extrapolate_from_channel_id() {
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
	const k = db.select({ id: schema.youtube_channel.id })
		.from(schema.youtube_channel)
		.where(sql`handle is null or name is null or description is null`)
		.all()

	if (k.length == 0) {
		return
	}

	const pc = new ProgressRef('youtube_channel.meta.youtube_channel')

	await run_with_concurrency_limit(k, 2, pc, async ({ id }) => {
		const channel = await meta_youtube_channel(id)

		type ChannelKey = keyof typeof channel.images

		// 'yt_avatar' | 'yt_banner' | 'yt_tv_banner' | 'yt_mobile_banner'
		const img_map: Record<ChannelKey, ImageKind> = {
			avatar: 'yt_avatar',
			banner: 'yt_banner',
			tvBanner: 'yt_tv_banner',
			mobileBanner: 'yt_mobile_banner',
		}

		for (const [key, kind] of Object.entries(img_map)) {
			const images = channel.images[key as ChannelKey]
			if (!images) {
				continue
			}

			const thumb = largest_image(images)

			if (thumb) {
				db_images_append_url(schema.youtube_channel, id, kind, thumb.url, thumb.width, thumb.height)
			}
		}

		// channel.about.description can be null or undefined

		db.update(schema.youtube_channel)
			.set({
				handle: channel.about.handle,
				name: channel.display_name,
				description: channel.about.description ?? '',
			})
			.where(sql`id = ${id}`)
			.run()

		const links = channel.about.links.map(({ url }) => url)
		db_links_append(schema.youtube_channel, id, links)
	})

	pc.close()

	return true
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
	description?: string | undefined
	details: {
		location: string
	}
	links: YoutubeChannelAboutLink[]
	handle: string // @pinocchiop
}

type YoutubeChannelSnippet = {
	avatar: YoutubeImage[] | null
	banner: YoutubeImage[] | null
	tvBanner: YoutubeImage[] | null
	mobileBanner: YoutubeImage[] | null
}

type YoutubeChannel = {
	about: YoutubeChannelAbout
	images: YoutubeChannelSnippet
	display_name: string
}

type YoutubeVideo = {
	id: string
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

// https://stackoverflow.com/questions/18953499/youtube-api-to-fetch-all-videos-on-a-channel

// to extract uploads, take youtube ID and change UC to UU
//
//       reol channel id: UCB6pJFaFByws3dQj4AdLdyA
//                        ^^
// reol uploads playlist: UUB6pJFaFByws3dQj4AdLdyA
//                        ^^
//
// https://www.youtube.com/playlist?list=UUB6pJFaFByws3dQj4AdLdyA
//                                       ^^^^^^^^^^^^^^^^^^^^^^^^

// https://yt4.lemnoslife.com/noKey/playlistItems
//     ?part=contentDetails
//     &playlistId=UUB6pJFaFByws3dQj4AdLdyA
//     &maxResults=50

// https://developers.google.com/youtube/v3/docs/playlistItems/list
// returns next page token, then go ?pageToken=...
