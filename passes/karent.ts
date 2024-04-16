import { sql } from "drizzle-orm"
import { db, ident_pk } from "../db"
import { ProgressRef } from "../server"
import { assert, db_backoff, db_backoff_forever, db_backoff_or_delete, db_backoff_sql, run_with_concurrency_limit } from "../util"
import { $karent_album, $karent_artist } from "../schema"
import { Ident, KarentArtistId, Link } from "../types"
import { link_insert } from "./links"

// can't directly pass a Response, because for some reason HTMLRewriter
// doesn't actually compute anything until much later
function karent_extract_album(html: string): [KarentArtistId | undefined, string[]] {
	let artist_id: KarentArtistId | undefined
	const derived_urls: string[] = []

	// find all links with the class "deli__btn", extract the href attribute, and log it

	// <a href="https://music.apple.com/jp/album/chimera-single/1615542278"
	//   target="_blank"
	//   class="deli__btn">Apple Music</a>

	// <p class="album__deta-artist">
	//     <a href="https://karent.jp/artist/pp000875">

	const html_extractor = new HTMLRewriter().on('a.deli__btn', {
		element(e) {
			const href = e.getAttribute('href')
			if (href) {
				derived_urls.push(href)
			}
		}
	}).on('p.album__deta-artist a', {
		element(e) {
			const href = e.getAttribute('href')
			if (href) {
				artist_id = href.split('/').pop() as KarentArtistId
			}
		}
	})

	// locale doesn't matter, we're only interested in the links

	html_extractor.transform(html)

	return [artist_id, derived_urls]
}

// karent_album.meta.karent_album
export async function pass_karent_album_meta_karent_album() {
	const DIDENT = 'karent_album.meta.karent_album'

	// karent albums, like most distributors, don't have their data changing
	// its quite rare, just issue infinite backoffs

	let updated = false
	const k = db.select({ id: $karent_album.id })
		.from($karent_album)
		.where(sql`karent_artist_id is null
			and ${db_backoff_sql(DIDENT, $karent_album, $karent_album.id)}`)
		.all()

	if (k.length == 0) {
		return
	}

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 5, pc, async ({ id }) => {
		const resp = await fetch(`https://karent.jp/album/${id}`)

		if (!resp.ok) {
			db_backoff_or_delete(DIDENT, $karent_album, $karent_album.id, id)
			return
		}

		const ident = ident_pk($karent_album, id)

		// TODO: i don't like this...
		const text = await resp.text()
		const [artist_id, derived_urls] = karent_extract_album(text)
		assert(Boolean(artist_id), 'artist_id is undefined')

		const links: Link[] = derived_urls.map(url => ({ ident, kind: 'unknown', data: url }))

		db.transaction(db => {
			link_insert(links)
			db.update($karent_album)
				.set({ karent_artist_id: artist_id })
				.where(sql`id = ${id}`)
				.run()
		})
		updated = true
	})

	pc.close()

	return updated
}

function karent_extract_artist(html: string) {
	// <div class="artist__deta">
	//     <p><a href="https://www.youtube.com/c/cosmobsp" class="artist__deta-option-youtube" target="_blank">YouTube</a></p>
	//     <p><a href="https://twitter.com/cosmobsp" class="artist__deta-option-twitter" target="_blank">twitter</a></p>
	//     <p><a href="https://piapro.jp/cosmobsp" class="artist__deta-option-piapro" target="_blank">piapro page</a></p>
	// </div>

	const derived_urls: string[] = []

	const html_extractor = new HTMLRewriter().on('div.artist__deta p a', {
		element(e) {
			const href = e.getAttribute('href')
			if (href) {
				console.log(href)
				derived_urls.push(href)
			}
		}
	})

	html_extractor.transform(html)

	return derived_urls
}

// karent_artist.meta.karent_artist
export async function pass_karent_artist_meta_karent_artist() {
	const DIDENT = 'karent_artist.meta.karent_artist'

	let updated = false
	const k = db.select({ id: $karent_artist.id })
		.from($karent_artist)
		.where(db_backoff_sql(DIDENT, $karent_artist, $karent_artist.id))
		.all()

	if (k.length == 0) {
		return
	}

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 5, pc, async ({ id }) => {
		const resp = await fetch(`https://karent.jp/artist/${id}`)

		if (!resp.ok) {
			db_backoff_or_delete(DIDENT, $karent_artist, $karent_artist.id, id)
			return
		}

		const ident = ident_pk($karent_artist, id)

		const text = await resp.text()
		const derived_urls = karent_extract_artist(text)

		const links: Link[] = derived_urls.map(url => ({ ident, kind: 'unknown', data: url }))

		db.transaction(db => {
			link_insert(links)
			db_backoff(DIDENT, ident)
		})
		updated = true
	})

	pc.close()

	return updated
}
