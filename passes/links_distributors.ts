import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { ProgressRef } from "../server"
import { run_with_concurrency_limit } from "../pass"
import { db_backoff_sql, db_register_backoff } from "../db_misc"

// links.extrapolate.from_karent_album
export async function pass_links_extrapolate_from_karent_album() {
	// select all karent albums not having any links derived from them
	const k = db.select({ id: schema.links.id, ident: schema.links.ident, data: schema.links.data })
		.from(schema.links)
		.where(sql`${schema.links.kind} = 'karent_album_id' and not exists (
			select 1 from ${schema.links} as derived
			where derived.derived_from = ${schema.links.id}
		) and ${db_backoff_sql(schema.links, schema.links.id, 'links.extrapolate.from_karent_album')}`)
		.all()

	if (k.length === 0) {
		return
	}

	// find all links with the class "deli__btn", extract the href attribute, and log it

	// <a href="https://music.apple.com/jp/album/chimera-single/1615542278"
	//   target="_blank"
	//   class="deli__btn">Apple Music</a>

	const pc = new ProgressRef('links.extrapolate.from_karent_album')

	let updated = false
	await run_with_concurrency_limit(k, 5, pc, async ({ id, ident, data }) => {
		const derived_urls: string[] = []

		const html_extractor = new HTMLRewriter().on('a.deli__btn', {
			element(e) {
				const href = e.getAttribute('href')
				if (href) {
					derived_urls.push(href)
				}
			}
		})

		// locale doesn't matter, we're only interested in the links

		// can't directly pass a Response, because for some reason it
		// doesn't actually compute anything until much later
		const resp = await fetch(`https://karent.jp/album/${data}`)
		if (!resp.ok) {
			db_register_backoff(schema.links, id, 'links.extrapolate.from_karent_album')
			return
		}
		html_extractor.transform(await resp.text())

		const to_insert = derived_urls.map(url => ({
			derived_from: id,
			ident: ident,
			kind: 'unknown',
			data: url,
		}))

		// insert the derived links
		db.insert(schema.links)
			.values(to_insert)
			.onConflictDoNothing()
			.run()
		updated = true
	})

	pc.close()

	return updated
}

// links.extrapolate.from_linkcore
export async function pass_links_extrapolate_from_linkcore() {
	// select all linkcore urls not having any links derived from them
	const k = db.select({ id: schema.links.id, ident: schema.links.ident, data: schema.links.data })
		.from(schema.links)
		.where(sql`${schema.links.kind} = 'linkcore' and not exists (
			select 1 from ${schema.links} as derived
			where derived.derived_from = ${schema.links.id}
		) and ${db_backoff_sql(schema.links, schema.links.id, 'links.extrapolate.from_linkcore')}`)
		.all()

	// links extracted from linkcore either are the link itself or are some
	// short link that redirects to the actual link. they'll be picked out
	// in later passes, just dump everything to unknown for now

	// extract everything with #store_id_*

	// <a href="https://www.tunecore.co.jp/to/spotify/687558?lang=en"
	//    id="store_id_305"
	//    title="Available on Spotify"
	//    data-store="305">
	// <a href="https://www.tunecore.co.jp/to/deezer/687558?lang=en"
	//    id="store_id_3805"
	//    title="Available on Deezer"
	//    data-store="3805">

	if (k.length === 0) {
		return
	}

	const pc = new ProgressRef('links.extrapolate.from_linkcore')

	let updated = false
	await run_with_concurrency_limit(k, 5, pc, async ({ id, ident, data }) => {
		const derived_urls: string[] = []

		// begins with store_id_
		const html_extractor = new HTMLRewriter().on('a[id^="store_id_"]', {
			element(e) {
				const href = e.getAttribute('href')
				if (href) {
					derived_urls.push(href)
				}
			}
		})

		const resp = await fetch(`https://linkco.re/${data}`)
		if (!resp.ok) {
			db_register_backoff(schema.links, id, 'links.extrapolate.from_linkcore')
			return
		}
		html_extractor.transform(await resp.text())

		console.log(derived_urls)

		const to_insert = derived_urls.map(url => ({
			derived_from: id,
			ident: ident,
			kind: 'unknown',
			data: url,
		}))

		// insert the derived links
		db.insert(schema.links)
			.values(to_insert)
			.onConflictDoNothing()
			.run()
		updated = true
	})

	pc.close()

	return updated
}
