import { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"
import { $artist, $karent_artist, $links, $locale, $spotify_artist, $vocadb_artist, $youtube_channel } from "../schema"
import { ArtistId, Ident, LinkKind } from "../types"
import { db, ident_pk, ident_pk_reverse } from "../db"
import { SQL, sql } from "drizzle-orm"

// artist.classify.auto
export function pass_artist_classify_auto() {
	const valid_table_rows = [
		[$spotify_artist, 'sp_artist_id'],
		[$youtube_channel, 'yt_channel_id'],
		[$vocadb_artist, 'vd_artist_id'],
		[$karent_artist, 'ka_artist_id'],
	] as const

	const valid_tables = new Map<SQLiteTable, LinkKind>(valid_table_rows)

	const start_idents = new Set<Ident>()

	for (let i = 0; i < valid_table_rows.length; i++) {
		const sel = valid_table_rows[i][0]

		// good thing sqlite is dynamically typed

		const k = db.select({ id: sql<string | number>`id` })
			.from(sel)
			.where(sql`artist_id is null`)
			.all()

		for (const { id } of k) {
			start_idents.add(ident_pk(sel, id))
		}
	}

	// none today
	if (start_idents.size === 0) {
		return
	}

	// no sql injection here i hope
	function sql_raw_kind_in(kinds: Iterable<string>) {
		return sql.raw('(' + [...kinds].map(k => `'${k}'`).join(', ') + ')')
	}

	function sql_valid_ident_in() {
		return sql.raw('(' + [...valid_tables.keys()].map(t => `'${ident_pk(t)}'`).join(', ') + ')')
	}

	let updated = false

	function classify(start_ident: Ident) {
		const visited = new Set<Ident>()

		// TODO: twitter links etc
		const shared_links = new Map<LinkKind, Set<string>>([
			['tw_user', new Set()],
			['pi_creator', new Set()],
		])

		// start> spotify id -> karent
		//          ^             \
		//          \---------- vocadb

		// start> spotify id -> karent
		//          ^
		//          \---------- vocadb <--- youtube_channel

		// 1. visit node, mark self as visited
		// 2. dispatch walks on all start is ponting to
		// 3. dispatch walks on all pointing to start

		// no sql injection here
		const valid_kind_sql = sql_raw_kind_in(valid_tables.values())
		const shared_kind_sql = sql_raw_kind_in(shared_links.keys())

		// TODO: find twitter users on postorder search, then search by twitter users

		function walk(ident: Ident) {
			const [data, table] = ident_pk_reverse(ident)
			const ident_pointing_to_kind = valid_tables.get(table)

			start_idents.delete(ident)
			visited.add(ident)

			const pointing_to_ident = db.select()
				.from($links)
				.where(sql`ident = ${ident} and (kind in ${valid_kind_sql} or kind in ${shared_kind_sql})`)
				.all()

			const ident_pointing_to = db.select()
				.from($links)
				.where(sql`data = ${data} and kind = ${ident_pointing_to_kind} and substr(ident, 1, 4) in ${sql_valid_ident_in()}`)
				.all()

			for (const { ident: to_ident, kind, data } of pointing_to_ident) {
				if (shared_links.has(kind)) {
					shared_links.get(kind)!.add(data)
					continue
				}

				if (!visited.has(to_ident)) {
					walk(to_ident)
				}
			}

			for (const { ident: from_ident } of ident_pointing_to) {
				if (!visited.has(from_ident)) {
					walk(from_ident)
				}
			}
		}

		walk(start_ident)

		// now walk all idents that match shared links

		for (const [kind, data] of shared_links) {
			const k = db.select()
				.from($links)
				.where(sql`kind = ${kind} and data in ${sql_raw_kind_in(data)}`)
				.all()

			for (const { ident } of k) {
				if (!valid_tables.has(ident_pk_reverse(ident)[1])) {
					continue
				}
				
				if (!visited.has(ident)) {
					walk(ident)
				}
			}
		}

		unify(visited)
		updated = true
	}

	for (const ident of start_idents) {
		classify(ident)
	}

	return updated
}

function unify(together: Iterable<Ident>) {
	let artist_id: ArtistId | undefined

	const need_to_be_updated: Ident[] = []

	for (const ident of together) {
		const [data, table] = ident_pk_reverse(ident)

		const k = db.select({ artist_id: sql<ArtistId>`artist_id` })
			.from(table)
			.where(sql`id = ${data} and artist_id is not null`)
			.get()

		if (k) {
			if (!artist_id) {
				artist_id = k.artist_id
			} else if (artist_id !== k.artist_id) {
				throw new Error(`multiple artists found, ${artist_id} and ${k.artist_id}`)
			}
		} else {
			need_to_be_updated.push(ident)
		}
	}

	if (!artist_id) {
		const new_artist = db.insert($artist)
			.values({})
			.returning()
			.get()

		artist_id = new_artist.id

		console.log(`new artist ${artist_id}`)
	} else {
		console.log(`found artist ${artist_id}`)
	}

	for (const ident of need_to_be_updated) {
		const [data, table] = ident_pk_reverse(ident)

		console.log(`updating ${ident} to ${artist_id}`)

		db.update(table)
			.set({ artist_id: artist_id })
			.where(sql`id = ${data}`)
			.run()
	}
}
