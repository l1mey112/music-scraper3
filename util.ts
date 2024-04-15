import { SQL, sql } from "drizzle-orm"
import { db, db_ident_pk, db_ident_pk_with } from "./db"
import { $retry_backoff } from "./schema"
import { ProgressRef, emit_log } from "./server"
import { DAYS, Ident, PassIdentifier } from "./types"
import { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core"
import { WyHash } from "./types"

export function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`assertion failed: ${message}`)
		console.log(new Error().stack)
		process.exit(1)
	}
}

export async function run_with_concurrency_limit<T>(arr: T[], concurrency_limit: number, ref: ProgressRef | undefined, next: (v: T) => Promise<void>): Promise<void> {
	if (arr.length == 0) {
		return
	}

	const active_promises: Promise<void>[] = []

	if (ref) {
		ref.emit(0)
	}

	let di = 0
	const diff = 100 / arr.length
	for (const item of arr) {
		// wait until there's room for a new operation
		while (active_promises.length >= concurrency_limit) {
			await Promise.race(active_promises)
		}

		const next_operation = next(item)
		active_promises.push(next_operation)

		// update progress
		if (ref) {
			di += diff
			ref.emit(di)
		}

		next_operation.finally(() => {
			const index = active_promises.indexOf(next_operation)
			if (index !== -1) {
				active_promises.splice(index, 1)
			}
		})
	}

	// wait for all active operations to complete
	await Promise.all(active_promises)
}

// run M operations per N milliseconds
// https://thoughtspile.github.io/2018/07/07/rate-limit-promises/
// this doesn't really follow the guide, it may be suboptimal but ehh
export async function run_with_throughput_limit<T>(arr: T[], M: number, N: number, ref: ProgressRef | undefined, next: (v: T) => Promise<void>): Promise<void> {
	if (arr.length == 0) {
		return
	}

	type Operation = { item: Promise<void>, date: Date }

	// in flight operation | last operation time
	const active_promises: Operation[] = []

	if (ref) {
		ref.emit(0)
	}

	let di = 0
	const diff = 100 / arr.length
	for (const item of arr) {
		// insert
		if (active_promises.length < M) {
			active_promises.push({ item: next(item), date: new Date(Date.now() + N) })
			continue
		}

		// find operation with the oldest date

		let oldest_idx = 0
		for (let i = 1; i < active_promises.length; i++) {
			if (active_promises[i].date < active_promises[oldest_idx].date) {
				oldest_idx = i
			}
		}

		// Bun sleeps up till the date
		const oldest = active_promises[oldest_idx]
		await oldest.item
		await Bun.sleep(oldest.date)

		// update progress
		if (ref) {
			di += diff
			ref.emit(di)
		}

		// replace
		active_promises[oldest_idx] = { item: next(item), date: new Date(Date.now() + N) }
	}

	await Promise.all(active_promises.map(v => v.item))
}

export function db_backoff_or_delete(pass: PassIdentifier, pk: SQLiteTable, pk_column: SQLiteColumn, id: any) {
	// only delete if there is zero existing backoff entries
	// this means that the data is brand new and we can delete it

	const ident = db_ident_pk_with(pk, id)

	// TODO: deletion of something only for it to be replaced in `all.extrapolate.from_links`
	//       how annoying...

	/* const db_count = db.select({ count: sql<number>`count(*)` })
		.from($retry_backoff)
		.where(sql`pass = ${wyhash(pass)} and ident = ${ident}`)
		.get()

	const count = db_count ? db_count.count : 0

	if (count == 0) {
		emit_log(`[db_backoff_or_delete] deleting early ${ident}, zero backoffs`)
		db.delete(pk)
			.where(sql`${pk_column} = ${id}`)
			.run()
		return
	} */

	db_backoff_forever(pass, ident)
}

export function db_backoff_forever(pass: PassIdentifier, id: Ident) {
	db.insert($retry_backoff)
		.values({
			issued: Date.now(),
			ident: id,
			pass: wyhash(pass),
		})
		.onConflictDoNothing()
		.run()
}

export function db_backoff_exactly(pass: PassIdentifier, id: Ident, time: number) {
	db.insert($retry_backoff)
		.values({
			issued: Date.now(),
			expire: Date.now() + time,
			ident: id,
			pass: wyhash(pass),
		})
		.onConflictDoNothing()
		.run()
}

// exponential backoff
// TODO: fix this mess later
export function db_backoff(pass: PassIdentifier, id: Ident) {
	// if exists already, exponentially backoff based on the last issued time
	db.insert($retry_backoff)
		.values({
			issued: Date.now(),
			expire: Date.now() + DAYS * 1,
			ident: id,
			pass: wyhash(pass),
		})
		.onConflictDoUpdate({
			target: [$retry_backoff.ident, $retry_backoff.pass],
			set: {
				issued: Date.now(),
				expire: sql`((expire - issued) * 2) + ${Date.now()}`,
			}
		})
		.run()
}

export function db_backoff_sql(pass: PassIdentifier, pk: SQLiteTable, pk_column: SQLiteColumn | string): SQL<boolean> {
	return sql`(
		not exists (
			select 1 from ${$retry_backoff} where ${$retry_backoff.ident} = (${db_ident_pk(pk)} || ${pk_column}) and
			pass = ${wyhash(pass)} and (expire is null or expire > ${Date.now()}))
	)`
}

export const WYHASH_SEED = 761864364875522238n

export function wyhash(s: string): WyHash {
	return Bun.hash.wyhash(s, WYHASH_SEED) as WyHash;
}

// TODO: use later
/* function youtube_id_from_url(video_url: string): string | undefined {
	const regex =  [
		/(?:http[s]?:\/\/)?(?:\w+\.)?youtube.com\/watch\?v=([\w_-]+)(?:[\/&].*)?/i,
		/(?:http[s]?:\/\/)?(?:\w+\.)?youtube.com\/(?:v|embed|shorts|video|watch|live)\/([\w_-]+)(?:[\/&].*)?/i,
		/(?:http[s]?:\/\/)?youtu.be\/([\w_-]+)(?:\?.*)?/i,
		/(?:http[s]?:\/\/)?filmot.com\/video\/([\w_-]+)(?:[?\/&].*)?/i,
		/(?:http[s]?:\/\/)?filmot.com\/sidebyside\/([\w_-]+)(?:[?\/&].*)?/i,
		/^([\w-]{11})$/i
	]

	for (const pattern of regex) {
		const match = video_url.match(pattern)
		if (match && match[1]) {
			return match[1]
		}
	}

	return undefined
} */
