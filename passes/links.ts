import { parse as tldts_parse } from "tldts"
import * as schema from '../schema'
import { db } from "../db"
import { sql } from "drizzle-orm"
import { run_with_concurrency_limit } from "../pass"
import { ProgressRef } from "../server"
import { meta_youtube_handle_to_id, youtube_channel_exists, youtube_video_exists } from "./youtube"
import { db_backoff_sql, db_backoff } from "../db_misc"
import { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"

// matches ...99a7_q9XuZY）←｜→次作：（しばしまたれよ）
//                       ^^^^^^^^^^^^^^^^^^^^^^^^^ very incorrect
//
// vscode uses a state machine to identify links, it also includes this code for characters that the URL cannot end in
//
// https://github.com/microsoft/vscode/blob/d6eba9b861e3ab7d1935cff61c3943e319f5c830/src/vs/editor/common/languages/linkComputer.ts#L152
// const CANNOT_END_IN = ' \t<>\'\"、。｡､，．：；‘〈「『〔（［｛｢｣｝］）〕』」〉’｀～….,;:'
//
const url_regex = /(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#][^\r\n \t<>'"、。｡､，．：；‘〈「『〔（［｛｢｣｝］）〕』」〉’｀～…\.,;:\(\)\[\]\{\}]*)?/ig

// there is a lot more rules here, specifically pertaining to characters that should be in the URL if it encloses the URL
// ive gone ahead and added `()[]{}` to the regex but not using this special logic
// https://github.com/microsoft/vscode/blob/d6eba9b861e3ab7d1935cff61c3943e319f5c830/src/vs/editor/common/languages/linkComputer.ts#L230

export function links_from_text(text: string): Set<string> {
	const url_set = new Set<string>()

	for (const url of text.matchAll(url_regex)) {
		url_set.add(url[0])
	}
	
	return url_set
}

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
	| { kind: 'piapro_creator',       data: string } // piapro.jp/{} + piapro.jp/my_page/?view=content&pid={}
	| { kind: 'niconico_video_id',    data: string } // www.nicovideo.jp/watch/{}
	| { kind: 'niconico_user_id',     data: string } // www.nicovideo.jp/user/{}
	| { kind: 'niconico_material_id', data: string } // commons.nicovideo.jp/material/{}
	| { kind: 'twitter_user',         data: string } // twitter.com/{} + x.com/{}
	| { kind: 'karent_album_id',      data: string } // karent.jp/album/{}
	| { kind: 'karent_artist_id',     data: string } // karent.jp/artist/{}
	| { kind: 'linkcore',             data: string } // linkco.re/{}
	| { kind: 'unknown',              data: string } // full URL as-is

// https://music.apple.com/au/album/ALBUM_NAME/ALBUM_ID?i=TRACK_ID

/*
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
	r?: RegExp // matched with stripped forward /
	m?: (string)[]
	//capture_subdomain?: boolean
}

type ClassifyBlock = Record<Exclude<string, "unknown">, LinkMatch[]>

type WeakClassifyLinks = Record<Exclude<Link["kind"], "unknown">, LinkMatch[]>
const weak_classify_links: WeakClassifyLinks = {
	'youtube_video_id': [
		{ domain: 'youtube.com', r: /\/watch/, m: ['v'] },
		{ domain: 'youtube.com', r: /\/(?:v|embed|shorts|video|watch|live)\/([^\/]+)/ },
		{ domain: 'youtu.be',    r: /\/([^\/]+)/ },
	],
	'youtube_channel_id': [
		{ domain: 'youtube.com', r: /\/channel\/([^\/]+)/ },
		// @handles require touching the network, not handled here
	],
	'youtube_playlist_id': [
		{ domain: 'youtube.com', r: /\/playlist/, m: ['list'] },
		{ subdomain: 'music', domain: 'youtube.com', r: /\/playlist/, m: ['list'] },
	],
	'spotify_track_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/track\/([^\/]+)/ },
	],
	'spotify_artist_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/artist\/([^\/]+)/ },
	],
	'spotify_album_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/album\/([^\/]+)/ },
	],
	'apple_album_id': [
		{ subdomain: 'music', domain: 'apple.com', r: /\/\w+\/album\/[\S^\/]+\/([^\/]+)/ },
		{ subdomain: 'music', domain: 'apple.com', r: /\/\w+\/album\/([^\/]+)/ },
	],
	'piapro_item_id': [
		{ domain: 'piapro.jp', r: /\/t\/([^\/]+)/ },
	],
	'piapro_creator': [
		{ domain: 'piapro.jp', r: /\/my_page/, m: ['pid'] },
		{ domain: 'piapro.jp', r: /\/([^\/]+)/ },
	],
	'niconico_video_id': [
		{ domain: 'nicovideo.jp', r: /\/watch\/([^\/]+)/ },
	],
	'niconico_user_id': [
		{ domain: 'nicovideo.jp', r: /\/user\/([^\/]+)/ },
	],
	'niconico_material_id': [
		{ subdomain: 'commons', domain: 'nicovideo.jp', r: /\/material\/([^\/]+)/ },
	],
	'twitter_user': [
		{ domain: 'twitter.com', r: /\/([^\/]+)/ },
		{ domain: 'x.com', r: /\/([^\/]+)/ },
	],
	'karent_album_id': [
		{ domain: 'karent.jp', r: /\/album\/([^\/]+)/ },
	],
	'karent_artist_id': [
		{ domain: 'karent.jp', r: /\/artist\/([^\/]+)/ },
	],
	'linkcore': [
		{ domain: 'linkco.re', r: /\/([^\/]+)/ },
	],
}

function link_classify(url: string, classify_links: ClassifyBlock): { kind: string, data: string } | undefined {
	// sometimes people paste links without https://
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		url = 'https://' + url
	}

	const url_obj = new URL(url)
	const url_tld = tldts_parse(url)

	// url_tld.subdomain can be "" instead of null, they're liars

	if (url_tld.subdomain === '') {
		url_tld.subdomain = null
	}

	if (url_tld.subdomain === 'www') {
		url_tld.subdomain = null
	}

	if (url_obj.pathname.endsWith('/')) {
		url_obj.pathname = url_obj.pathname.slice(0, -1)
	}

	for (const [kind, matches] of Object.entries(classify_links)) {
		nmatch: for (const match of matches) {
			// undefined == null
			if (match.subdomain != url_tld.subdomain) {
				continue nmatch
			}

			if (match.domain !== url_tld.domain) {
				continue nmatch
			}

			const match_idents = []

			if (match.r) {
				const re_match = match.r.exec(url_obj.pathname)
				if (!re_match) {
					continue nmatch
				}

				if (re_match.length > 1) {
					match_idents.push(...re_match.slice(1))
				}
			}

			if (match.m) {
				for (const m of match.m) {
					const param = url_obj.searchParams.get(m)
					if (!param) {
						continue nmatch
					}
					match_idents.push(param)
				}
			}

			return { kind: kind as Link["kind"], data: match_idents.join('/') }
		}
	}

	return undefined
}

// links.classify.weak
export function pass_links_classify_weak() {
	let updated = 0
	const k = db.select({ id: schema.links.id, data: schema.links.data })
		.from(schema.links)
		.where(sql`kind = 'unknown'`)
		.all()
	
	for (const { id, data } of k) {
		const classified = link_classify(data, weak_classify_links)
		if (!classified) {
			continue
		}

		// should probably intern these
		db.update(schema.links)
			.set({ kind: classified.kind, data: classified.data })
			.where(sql`id = ${id}`)
			.run()
		updated++
	}

	return updated > 0
}

// https://www.youtube.com/c/r3musicboxenglish/playlists
//                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                        these links exist, ignore the bottom part
//                        they seem like legacy links, because those don't line up to a proper handle

const strong_classify_links_helper: ClassifyBlock = {
	'youtube_channel_handle': [
		{ domain: 'youtube.com', r: /\/@([^\/]+)/ },
		{ domain: 'youtube.com', r: /\/c\/([^\/]+)/ },
	],
}

// links.classify.strong
export async function pass_links_classify_strong() {
	let updated = 0
	let k = db.select({ id: schema.links.id, data: schema.links.data })
		.from(schema.links)
		.where(sql`kind = 'unknown' and ${db_backoff_sql(schema.links, schema.links.id, 'links.classify.strong')}`)
		.all()

	const pc = new ProgressRef('links.classify.strong')

	await run_with_concurrency_limit(k, 5, pc, async ({ id, data }) => {
		const classified = link_classify(data, strong_classify_links_helper)
		if (!classified) {
			return
		}

		switch (classified.kind) {
			case 'youtube_channel_handle': {
				if (!classified.data.startsWith('@')) {
					classified.data = '@' + classified.data
				}

				const channel_id = await meta_youtube_handle_to_id(classified.data)
				if (!channel_id) {
					db_backoff(schema.links, id, 'links.classify.strong')
					return
				}
				classified.data = channel_id
				classified.kind = 'youtube_channel_id'
				break
			}
			default: {
				return
			}
		}

		db.update(schema.links)
			.set({ kind: classified.kind, data: classified.data })
			.where(sql`id = ${id}`)
			.run()
		updated++
	})

	pc.close()

	return updated > 0
}

// all.extrapolate.from_links
export async function pass_all_extrapolate_from_links() {
	// only extrapolate certain things that will help us widen
	// expand vertically, going up the chain to parent articles (artist ids etc)
	// not horizontally, going to entirely different people	that don't matter

	// we'll extract things that don't matter, but try to limit it.
	// inside a youtube video we obviously won't extract channels and videos
	// from the description, since we know where the video is from already.
	// though extract spotify links and others, they're not as obvious

	let updated = false
	const pc = new ProgressRef('all.extrapolate.from_links')

	// select from links where those identifiers don't show up in the tables

	/* const youtube_channels = db.select({ id: schema.links.id, data: schema.links.data })
		.from(schema.links)
		.where(sql`${schema.links.kind} = 'youtube_channel_id'
			and ${db_backoff_sql(schema.links, schema.links.id, 'all.extrapolate.from_links')}
			and ${schema.links.data} not in (select ${schema.youtube_channel.id} from ${schema.youtube_channel})
		`)
		.all() */

	function links_select(link_kind: string, notexisting_ft: SQLiteTable, notexisting_fk: SQLiteColumn) {
		return db.select({ id: schema.links.id, data: schema.links.data })
			.from(schema.links)
			.where(sql`${schema.links.kind} = ${link_kind}
				and ${db_backoff_sql(schema.links, schema.links.id, 'all.extrapolate.from_links')}
				and ${schema.links.data} not in (select ${notexisting_fk} from ${notexisting_ft})
			`)
			.all()
	}

	const spotify_artists = links_select('spotify_artist_id', schema.spotify_artist, schema.spotify_artist.id)
	const spotify_albums = links_select('spotify_album_id', schema.spotify_album, schema.spotify_album.id)
	const spotify_tracks = links_select('spotify_track_id', schema.spotify_track, schema.spotify_track.id)

	// can't use sets to prune data since we need to preserve ids to attach backoff
	// also can't use sets because there is no value equality for objects

	// using delete on an array and introducing holes isn't actually that bad
	// ill need holes to preserve the index

	async function spotify_oembed_test(rows: { id: number, data: string }[], prefix: string) {
		await run_with_concurrency_limit(Array.from(rows.entries()), 5, pc, async ([idx, { id, data }]) => {
			// highly optimised for the case where the link is valid.
			// if the link is invalid, we will hang the shit out of the servers
			// and they'll actually time out after 5 whole seconds.
			// nice oversight spotify.
			const resp = await fetch(`https://open.spotify.com/oembed?url=${prefix}${data}`)

			if (!resp.ok) {
				db_backoff(schema.links, id, 'all.extrapolate.from_links')
				delete rows[idx]
			} else {
				updated = true
			}
		})

		const set = new Set(rows.filter(it => it).map(it => it.data))
		
		return Array.from(set)
	}

	const nspotify_artists = await spotify_oembed_test(spotify_artists, "https://open.spotify.com/artist/")
	const nspotify_albums = await spotify_oembed_test(spotify_albums, "https://open.spotify.com/album/")
	const nspotify_tracks = await spotify_oembed_test(spotify_tracks, "https://open.spotify.com/track/")

	if (nspotify_artists.length > 0) {
		db.insert(schema.spotify_artist)
			.values(nspotify_artists.map(it => ({ id: it })))
			.run()
	}

	if (nspotify_albums.length > 0) {
		db.insert(schema.spotify_album)
			.values(nspotify_albums.map(it => ({ id: it })))
			.run()
	}

	if (nspotify_tracks.length > 0) {
		db.insert(schema.spotify_track)
			.values(nspotify_tracks.map(it => ({ id: it })))
			.run()
	}

	pc.close()

	return updated
}

// https://gist.github.com/HoangTuan110/e6eb412ed32657c841fcc2c12c156f9d

// handle tunecore links as well, they're link shorteners
// https://www.tunecore.co.jp/to/apple_music/687558

const link_shorteners_classify: ClassifyBlock = {
	'bitly':    [ { domain: 'bit.ly'                      } ],
	'cuttly':   [ { domain: 'cutt.ly'                     } ],
	'niconico': [ { domain: 'nico.ms'                     } ],
	'tco':      [ { domain: 't.co'                        } ],
	'xgd':      [ { domain: 'x.gd'                        } ],
	'tunecore': [ { domain: 'tunecore.co.jp', r: /\/to\// } ],
}

// links.classify.link_shorteners
export async function pass_links_classify_link_shorteners() {
	let updated = 0
	let k = db.select({ id: schema.links.id, data: schema.links.data })
		.from(schema.links)
		.where(sql`kind = 'unknown' and ${db_backoff_sql(schema.links, schema.links.id, 'links.classify.link_shorteners')}`)
		.all()

	// match only the ones that are in the list
	k = k.filter(({ data }) => link_classify(data, link_shorteners_classify))

	const pc = new ProgressRef('links.classify.link_shorteners')

	await run_with_concurrency_limit(k, 5, pc, async ({ id, data }) => {
		const req = await fetch(data)

		// even if it passes through the shortener
		// 1. it might not be a valid link
		// 2. the server might not support HEAD requests (though supporting GET just fine)
		//    some servers return 404 on HEAD (200 for GET) but URL is intact

		// don't req HEAD, just req GET. annoying that they aren't standards compliant

		// no redirect
		// most likely req.ok isn't true as well
		if (req.url === data) {
			console.log(req.url, data)
			db_backoff(schema.links, id, 'links.classify.link_shorteners')
			return
		}

		// just go ahead and insert it back in regardless

		db.update(schema.links)
			.set({ data: req.url })
			.where(sql`id = ${id}`)
			.run()
		updated++
	})

	pc.close()

	return updated > 0
}
