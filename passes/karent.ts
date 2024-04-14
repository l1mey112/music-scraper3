import { sql } from "drizzle-orm"
import { db, db_ident_pk, db_ident_pk_with } from "../db"
import { db_links_append } from "../db_misc"
import { ProgressRef } from "../server"
import { db_backoff_forever, db_backoff_or_delete, db_backoff_sql, run_with_concurrency_limit } from "../util"
import { $karent_album } from "../schema"
import { Ident } from "../types"

// can't directly pass a Response, because for some reason HTMLRewriter
// doesn't actually compute anything until much later
function karent_extract_derived_urls(html: string) {
	const derived_urls: string[] = []

	// find all links with the class "deli__btn", extract the href attribute, and log it

	// <a href="https://music.apple.com/jp/album/chimera-single/1615542278"
	//   target="_blank"
	//   class="deli__btn">Apple Music</a>

	const html_extractor = new HTMLRewriter().on('a.deli__btn', {
		element(e) {
			const href = e.getAttribute('href')
			if (href) {
				derived_urls.push(href)
			}
		}
	})

	// locale doesn't matter, we're only interested in the links

	html_extractor.transform(html)

	return derived_urls
}

// karent_album.meta.karent_album
export async function pass_karent_album_meta_karent_album() {
	const DIDENT = 'karent_album.meta.karent_album'

	// karent albums, like most distributors, don't have their data changing
	// its quite rare, just issue infinite backoffs

	const k = db.select({ id: $karent_album.id })
		.from($karent_album)
		.where(db_backoff_sql(DIDENT, $karent_album, $karent_album.id))
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

		const ident = db_ident_pk_with($karent_album, id)

		// TODO: i don't like this...
		const text = await resp.text()
		const derived_urls = karent_extract_derived_urls(text)

		db.transaction(db => {
			db_links_append($karent_album, id, derived_urls)
			db_backoff_forever(DIDENT, ident)
		})
	})

	pc.close()

	return true
}
