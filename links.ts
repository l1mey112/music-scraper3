type strin2 = `${string}/${string}`

type Link =
	| { kind: 'youtube_video_id',     data: string } // base64
	| { kind: 'youtube_channel_id',   data: string } // base64 (normalised from multiple sources, youtube.com/@MitsumoriMusic as well)
	| { kind: 'youtube_playlist_id',  data: string } // base64 - youtube.com/playlist?list={}
	| { kind: 'spotify_track_id',     data: string } // open.spotify.com/track/{}
	| { kind: 'spotify_artist_id',    data: string } // open.spotify.com/artist/{}
	| { kind: 'spotify_album_id',     data: string } // open.spotify.com/album/{}
	| { kind: 'apple_album_id',       data: string } // music.apple.com/_/album/_/{}
	| { kind: 'piapro_item_id',       data: string } // piapro.jp/t/{}
	| { kind: 'piapro_creator_id',    data: string } // piapro.jp/{} + piapro.jp/my_page/?view=content&pid={}
	| { kind: 'linkcore_id',          data: string } // linkco.re/{}
	| { kind: 'niconico_video_id',    data: string } // www.nicovideo.jp/watch/{}
	| { kind: 'niconico_user_id',     data: string } // www.nicovideo.jp/user/{}
	| { kind: 'niconico_material_id', data: string } // commons.nicovideo.jp/material/{}
	| { kind: 'twitter_id',           data: string } // twitter.com/{} + x.com/{}
	| { kind: 'tiktok_id',            data: string } // www.tiktok.com/@{}
	| { kind: 'gdrive_folder_id',     data: string } // drive.google.com/drive/folders/{}
	| { kind: 'gdrive_file_id',       data: string } // drive.google.com/file/d/{}/(view|edit)
	| { kind: 'gdrive_docs_id',       data: string } // docs.google.com/document/d/{}/(view|edit)
	| { kind: 'instagram_user_id',    data: string } // instagram.com/{}	
	| { kind: 'karent_album_id',      data: string } // karent.jp/album/{}
	| { kind: 'karent_artist_id',     data: string } // karent.jp/artist/{}
	| { kind: 'linkcore',             data: string } // linkco.re/{}
	| { kind: 'lnkto',                data: string } // lnk.to/{}
	| { kind: 'lnkto_composite',      data: strin2 } // {}.lnk.to/{} -> {}/{}
	| { kind: 'dropbox_fshare_id',    data: strin2 } // www.dropbox.com/sh/{}/{} -> {}/{}
	| { kind: 'bitly_short_link',     data: string } // bit.ly/{}
	| { kind: 'cuttly_short_link',    data: string } // cutt.ly/{}
	| { kind: 'twitter_short_link',   data: string } // t.co/{}
	| { kind: 'niconico_short_link',  data: string } // nico.ms/{}
	| { kind: 'linktree',             data: string } // linktr.ee/{}
	| { kind: 'litlink',              data: string } // lit.link/(en|ja|...)/{}
	| { kind: 'unknown',              data: string } // full URL as-is

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

// capture subdomain captures subdomain, matches are pushed first
// RegExp matches URL, matches are pushed
// string matches URL params, matches are pushed
type LinkMatch = {
	subdomain?: string // www -> undefined
	domain: string
	r: RegExp | string // matched with stripped forward /
	m?: (string)[]
	capture_subdomain?: boolean
}


function weak_classify(t: string) {
	type Links = Record<Exclude<Link["kind"], 'unknown'>, LinkMatch[]> /* { [key: Link["kind"]]: LinkMatch[] } */

	const links: Links = {
		'youtube_video_id': [
			{ domain: 'youtube.com', r: '/watch', m: ['v'] },
			{ domain: 'youtube.com', r: /\/(?:v|embed|shorts|video|watch|live)\/(\S+)/ },
			{ domain: 'youtu.be',    r: /\/(\S+)/ },
		],
		'youtube_channel_id': [
			{ domain: 'youtube.com', r: /\/channel\/(\S+)/ },
			// @handles require touching the network, not handled here
		],
		'youtube_playlist_id': [
			{ domain: 'youtube.com', r: '/playlist', m: ['list'] },
		],
		'spotify_track_id': [
			{ domain: 'open.spotify.com', r: /\/track\/(\S+)/ },
		],
		'spotify_artist_id': [
			{ domain: 'open.spotify.com', r: /\/artist\/(\S+)/ },
		],
		'spotify_album_id': [
			{ domain: 'open.spotify.com', r: /\/album\/(\S+)/ },
		],
		// apple_album_id
		'piapro_item_id': [
			{ domain: 'piapro.jp', r: /\/t\/(\S+)/ },
		],
		'piapro_creator_id': [
			{ domain: 'piapro.jp', r: /\/my_page/, m: ['pid'] },
			{ domain: 'piapro.jp', r: /\/(\S+)/ },
		],
		'niconico_video_id': [
			{ domain: 'nicovideo.jp', r: /\/watch\/(\S+)/ },
		],
		'niconico_user_id': [
			{ domain: 'nicovideo.jp', r: /\/user\/(\S+)/ },
		],
		'niconico_material_id': [
			{ subdomain: 'commons', domain: 'nicovideo.jp', r: /\/material\/(\S+)/ },
		],
		'twitter_id': [
			{ domain: 'twitter.com', r: /\/(\w+)/ },
			{ domain: 'x.com', r: /\/(\w+)/ },
		],
		'tiktok_id': [
			{ domain: 'tiktok.com', r: /\/@(\S+)/ },
		],
		'gdrive_folder_id': [
			{ domain: 'drive.google.com', r: /\/drive\/folders\/(\S+)/ },
		],
		'gdrive_file_id': [
			{ domain: 'drive.google.com', r: /\/file\/d\/(\S+)\/(?:view|edit)/ },
		],
		'gdrive_docs_id': [
			{ domain: 'docs.google.com', r: /\/document\/d\/(\S+)\/(?:view|edit)/ },
		],
		'instagram_user_id': [
			{ domain: 'instagram.com', r: /\/(\S+)/ },
		],
		'karent_album_id': [
			{ domain: 'karent.jp', r: /\/album\/(\S+)/ },
		],
		'karent_artist_id': [
			{ domain: 'karent.jp', r: /\/artist\/(\S+)/ },
		],
		'linkcore': [
			{ domain: 'linkco.re', r: /\/(\S+)/ },
		],
		'lnkto': [
			{ domain: 'lnk.to', r: /\/(\S+)/ },
		],
		'lnkto_composite': [
			{ domain: 'lnk.to', r: /\/(\w+)/, capture_subdomain: true },
		],
		'dropbox_fshare_id': [
			{ domain: 'dropbox.com', r: /\/sh\/(\S+)\/(\S+)/ },
		],
		'bitly_short_link': [
			{ domain: 'bit.ly', r: /\/(\S+)/ },
		],
		'cuttly_short_link': [
			{ domain: 'cutt.ly', r: /\/(\S+)/ },
		],
		'twitter_short_link': [
			{ domain: 't.co', r: /\/(\S+)/ },
		],
		'niconico_short_link': [
			{ domain: 'nico.ms', r: /\/(\S+)/ },
		],
		'linktree': [
			{ domain: 'linktr.ee', r: /\/(\S+)/ },
		],
		'litlink': [
			{ domain: 'lit.link', r: /\/(?:[\w]{2})\/(\S+)/ },
		],
	}
}
