import { parse } from "tldts"

type strin2 = `${string}/${string}`

type Link =
	| { kind: 'youtube_video_id',     data: string } // base64
	| { kind: 'youtube_channel_id',   data: string } // base64 (normalised from multiple sources, youtube.com/@MitsumoriMusic as well)
	| { kind: 'youtube_playlist_id',  data: string } // base64 - youtube.com/playlist?list={}
	| { kind: 'spotify_track_id',     data: string } // open.spotify.com/track/{}
	| { kind: 'spotify_artist_id',    data: string } // open.spotify.com/artist/{}
	| { kind: 'spotify_album_id',     data: string } // open.spotify.com/album/{}
	| { kind: 'apple_album_id',       data: string } // music.apple.com/_/album/_/{} + music.apple.com/_/album/{}
	| { kind: 'piapro_item_id',       data: string } // piapro.jp/t/{}
	| { kind: 'piapro_creator_id',    data: string } // piapro.jp/{} + piapro.jp/my_page/?view=content&pid={}
	| { kind: 'niconico_video_id',    data: string } // www.nicovideo.jp/watch/{}
	| { kind: 'niconico_user_id',     data: string } // www.nicovideo.jp/user/{}
	| { kind: 'niconico_material_id', data: string } // commons.nicovideo.jp/material/{}
	| { kind: 'twitter_id',           data: string } // twitter.com/{} + x.com/{}
	| { kind: 'karent_album_id',      data: string } // karent.jp/album/{}
	| { kind: 'karent_artist_id',     data: string } // karent.jp/artist/{}
	| { kind: 'unknown',              data: string } // full URL as-is

// https://music.apple.com/au/album/ALBUM_NAME/ALBUM_ID?i=TRACK_ID

/*
	| { kind: 'linkcore',             data: string } // linkco.re/{}
	| { kind: 'lnkto',                data: string } // lnk.to/{}
	| { kind: 'lnkto_composite',      data: strin2 } // {}.lnk.to/{} -> {}/{}
	| { kind: 'bitly_short_link',     data: string } // bit.ly/{}
	| { kind: 'cuttly_short_link',    data: string } // cutt.ly/{}
	| { kind: 'twitter_short_link',   data: string } // t.co/{}
	| { kind: 'niconico_short_link',  data: string } // nico.ms/{}
	| { kind: 'linktree',             data: string } // linktr.ee/{}
	| { kind: 'litlink',              data: string } // lit.link/(en|ja|...)/{}
*/

/*
	| { kind: 'soundcloud_artist',    data: string } // soundcloud.com/{}
	| { kind: 'soundcloud_album',     data: strin2 } // soundcloud.com/{}/ {} -> {}/{}
	| { kind: 'bandcamp_album',       data: strin2 } // {}.bandcamp.com/album/{}/ -> {}
	| { kind: 'bandcamp_artist',      data: string } // {}.bandcamp.com/
*/

// run a pass to expand link shorteners to their original
// convert every link to unknown then run passes

// piapro.jp/my_page/?view=content&pid={}
// - { domain: 'piapro.jp', r: /\/my_page/, m: ['pid'] }
//
// x.com/{}
// - { domain: 'x.com', r: /\/(\w+)/ }
//
// {}.lnk.to/{}
// - { domain: 'lnk.to', r: /\/(\w+)/, capture_subdomain: true }

// use [\S^\/]+ for \S+

// capture subdomain captures subdomain, matches are pushed first
// RegExp matches URL, matches are pushed
// string matches URL params, matches are pushed
type LinkMatch = {
	subdomain?: string // www -> undefined
	domain: string
	r: RegExp | string // matched with stripped forward /
	m?: (string)[]
	//capture_subdomain?: boolean
}

type WealClassifyLinks = Record<Exclude<Link["kind"], 'unknown'>, LinkMatch[]>

const weak_classify_links: WealClassifyLinks = {
	'youtube_video_id': [
		{ domain: 'youtube.com', r: '/watch', m: ['v'] },
		{ domain: 'youtube.com', r: /\/(?:v|embed|shorts|video|watch|live)\/([\S^\/]+)/ },
		{ domain: 'youtu.be',    r: /\/([\S^\/]+)/ },
	],
	'youtube_channel_id': [
		{ domain: 'youtube.com', r: /\/channel\/([\S^\/]+)/ },
		// @handles require touching the network, not handled here
	],
	'youtube_playlist_id': [
		{ domain: 'youtube.com', r: '/playlist', m: ['list'] },
	],
	'spotify_track_id': [
		{ domain: 'open.spotify.com', r: /\/track\/([\S^\/]+)/ },
	],
	'spotify_artist_id': [
		{ domain: 'open.spotify.com', r: /\/artist\/([\S^\/]+)/ },
	],
	'spotify_album_id': [
		{ domain: 'open.spotify.com', r: /\/album\/([\S^\/]+)/ },
	],
	'apple_album_id': [
		{ subdomain: 'music', domain: 'apple.com', r: /\/\w+\/album\/[\S^\/]+\/([\S^\/]+)/ },
		{ subdomain: 'music', domain: 'apple.com', r: /\/\w+\/album\/([\S^\/]+)/ },
	],
	'piapro_item_id': [
		{ domain: 'piapro.jp', r: /\/t\/([\S^\/]+)/ },
	],
	'piapro_creator_id': [
		{ domain: 'piapro.jp', r: /\/my_page/, m: ['pid'] },
		{ domain: 'piapro.jp', r: /\/([\S^\/]+)/ },
	],
	'niconico_video_id': [
		{ domain: 'nicovideo.jp', r: /\/watch\/([\S^\/]+)/ },
	],
	'niconico_user_id': [
		{ domain: 'nicovideo.jp', r: /\/user\/([\S^\/]+)/ },
	],
	'niconico_material_id': [
		{ subdomain: 'commons', domain: 'nicovideo.jp', r: /\/material\/([\S^\/]+)/ },
	],
	'twitter_id': [
		{ domain: 'twitter.com', r: /\/(\w+)/ },
		{ domain: 'x.com', r: /\/(\w+)/ },
	],
	'karent_album_id': [
		{ domain: 'karent.jp', r: /\/album\/([\S^\/]+)/ },
	],
	'karent_artist_id': [
		{ domain: 'karent.jp', r: /\/artist\/([\S^\/]+)/ },
	],
}

export function weak_classify(url: string) {
	for (const [kind, matches] of Object.entries(weak_classify_links)) {
		for (const match of matches) {
			const re = new RegExp(match.r)

			
			
			// const re_match = url.match(re)
			/* const { domain, r, m } = match
			if (match) {
				const data = m ? Object.fromEntries(m.map((k, i) => [k, match[i + 1]])) : match[1]
				return { kind: kind as Link["kind"], data }
			} */
		}
	}
}
