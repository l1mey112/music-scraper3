import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { db_backoff_sql, db_backoff, db_links_append, Backoff } from "../db_misc"
import { ProgressRef } from "../server"
import { run_with_concurrency_limit } from "../pass"

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

	const k = db.select({ id: schema.karent_album.id })
		.from(schema.karent_album)
		.where(db_backoff_sql(schema.karent_album, schema.karent_album.id, DIDENT))
		.all()

	if (k.length == 0) {
		return
	}

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 5, pc, async ({ id }) => {
		const resp = await fetch(`https://karent.jp/album/${id}`)
		
		if (!resp.ok) {
			throw new Error(`karent album req failed`)
		}

		// TODO: i don't like this...
		const text = await resp.text()
		const derived_urls = karent_extract_derived_urls(text)

		db_links_append(schema.karent_album, id, derived_urls)
		db_backoff(schema.karent_album, id, DIDENT, Backoff.Complete)
	})

	pc.close()

	return true
}
