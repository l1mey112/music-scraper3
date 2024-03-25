type Image = {
	url: string
	width: number
	height: number
}

type ChannelAboutLink = {
	url: string   // "https://open.spotify.com/artist/3b7jPCedJ2VH4l4rcOTvNC"
	title: string // "Spotify"
	// ignore favicons, they're huge wastes of space
	// favicon: { url: string, width: number, height: number }[]
}

type ChannelAbout = {
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
	links: ChannelAboutLink[]
	handle: string // @pinocchiop
}

type ChannelSnippet = {
	avatar: Image[]
	banner: Image[]
	tvBanner: Image[]
	mobileBanner: Image[]
}

export type YoutubeChannel = {
	about: ChannelAbout
	images: ChannelSnippet
}

// much slower, but we need the URLs
async function youtube_channel(channel_id: string): Promise<YoutubeChannel> {
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

export type YoutubeVideo = {
	publishedAt: string
	channelId: string
	title: string
	description: string
	thumbnails: {
		[key: string]: Image // key being "default" | "medium" | "high" | "standard" | "maxres" | ...
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

// https://github.com/mattwright324/youtube-metadata
const default_key = atob('QUl6YVN5QVNUTVFjay1qdHRGOHF5OXJ0RW50MUh5RVl3NUFtaEU4')

// magnitudes faster
async function youtube_video(video_id: string): Promise<YoutubeVideo> {
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
