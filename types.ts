// misc
export type MaybePromise<T> = T | Promise<T>

export type YoutubeVideoId = string
export type YoutubeChannelId = string

export type Image = {
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
	avatar: Image[]
	banner: Image[]
	tvBanner: Image[]
	mobileBanner: Image[]
}

export type YoutubeChannel = {
	about: YoutubeChannelAbout
	images: YoutubeChannelSnippet
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
