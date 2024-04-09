import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { ProgressRef } from "../server"
import { run_with_concurrency_limit } from "../pass"
import { link_delete, link_insert } from "./links"

// links.extrapolate.from_linkcore
export async function pass_links_extrapolate_from_linkcore() {
	// select all linkcore urls not having any links derived from them
	const k = db.select()
		.from(schema.links)
		.where(sql`${schema.links.kind} = 'linkcore'`)
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
	await run_with_concurrency_limit(k, 5, pc, async (link) => {
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

		link_delete(link) // consume

		const resp = await fetch(`https://linkco.re/${link.data}`)
		if (!resp.ok) {
			return
		}
		html_extractor.transform(await resp.text())

		const to_insert = derived_urls.map(url => ({
			ident: link.ident,
			kind: 'unknown',
			data: url,
		}))

		link_insert(to_insert)
		updated = true
	})

	pc.close()

	return updated
}
