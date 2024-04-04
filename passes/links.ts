import { parse as tldts_parse } from "tldts"
import * as schema from '../schema'
import { db } from "../db"
import { db_hash, db_ident_pk } from "../misc"
import { SQLiteTable } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { run_with_concurrency_limit } from "../pass"
import { ProgressRef } from "../server"
import { meta_youtube_handle_to_id } from "./youtube"

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
	r: RegExp // matched with stripped forward /
	m?: (string)[]
	//capture_subdomain?: boolean
}

type ClassifyBlock = Record<Exclude<string, "unknown">, LinkMatch[]>

type WeakClassifyLinks = Record<Exclude<Link["kind"], "unknown">, LinkMatch[]>
const weak_classify_links: WeakClassifyLinks = {
	'youtube_video_id': [
		{ domain: 'youtube.com', r: /\/watch/, m: ['v'] },
		{ domain: 'youtube.com', r: /\/(?:v|embed|shorts|video|watch|live)\/([\S^\/]+)/ },
		{ domain: 'youtu.be',    r: /\/([\S^\/]+)/ },
	],
	'youtube_channel_id': [
		{ domain: 'youtube.com', r: /\/channel\/([\S^\/]+)/ },
		// @handles require touching the network, not handled here
	],
	'youtube_playlist_id': [
		{ domain: 'youtube.com', r: /\/playlist/, m: ['list'] },
		{ subdomain: 'music', domain: 'youtube.com', r: /\/playlist/, m: ['list'] },
	],
	'spotify_track_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/track\/([\S^\/]+)/ },
	],
	'spotify_artist_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/artist\/([\S^\/]+)/ },
	],
	'spotify_album_id': [
		{ subdomain: 'open', domain: 'spotify.com', r: /\/album\/([\S^\/]+)/ },
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
		{ domain: 'twitter.com', r: /\/([\S^\/]+)/ },
		{ domain: 'x.com', r: /\/([\S^\/]+)/ },
	],
	'karent_album_id': [
		{ domain: 'karent.jp', r: /\/album\/([\S^\/]+)/ },
	],
	'karent_artist_id': [
		{ domain: 'karent.jp', r: /\/artist\/([\S^\/]+)/ },
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

			const re_match = match.r.exec(url_obj.pathname)
			if (!re_match) {
				continue nmatch
			}

			if (re_match.length > 1) {
				match_idents.push(...re_match.slice(1))
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

			if (match_idents.length === 0) {
				throw new Error('no match idents found - should never happen')
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

const strong_classify_links_helper: ClassifyBlock = {
	'youtube_channel_handle': [
		{ domain: 'youtube.com', r: /\/@([\S^\/]+)/ },
		{ domain: 'youtube.com', r: /\/c\/([\S^\/]+)/ },
	],
}

// links.classify.strong
export async function pass_links_classify_strong() {
	let updated = 0
	const k = db.select({ id: schema.links.id, data: schema.links.data })
		.from(schema.links)
		.where(sql`kind = 'unknown'`)
		.all()

	const pc = new ProgressRef('links.classify.strong')

	await run_with_concurrency_limit(k, 5, pc, async ({ id, data }) => {
		const classified = link_classify(data, strong_classify_links_helper)
		if (!classified) {
			return
		}

		switch (classified.kind) {
			case 'youtube_channel_handle': {
				const channel_id = await meta_youtube_handle_to_id(classified.data)
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

export function db_links_append(pk: SQLiteTable, pk_id: string | number, urls: string[]) {
	if (urls.length === 0) {
		return
	}

	const links = urls.map((url) => ({
		ident: db_ident_pk(pk) + pk_id,
		kind: 'unknown',
		data: url,
	}))

	db.insert(schema.links)
		.values(links)
		.onConflictDoNothing()
		.run()
}
