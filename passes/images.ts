import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { ImageKind } from "../types";
import * as schema from '../schema'
import { db, db_ident_pk } from "../db";
import { db_backoff_sql, db_fs_sharded_lazy_bunfile, db_register_backoff } from "../db_misc";
import { sql } from "drizzle-orm";
import { run_with_concurrency_limit } from "../pass";
import { ProgressRef } from "../server";
import { mime_ext } from "../mime";

export function db_images_append_url(pk: SQLiteTable, pk_id: string | number, kind: ImageKind, url: string, width: number, height: number) {
	db.insert(schema.images)
		.values({
			ident: db_ident_pk(pk) + pk_id,
			kind: kind,
			url: url,
			width: width,
			height: height,
		})
		.onConflictDoNothing()
		.run()
}

// images.download.images
export async function pass_images_download_images() {
	let update = false
	const urls = db.select({ rowid: sql<number>`rowid`, url: sql<string>`url` })
		.from(schema.images)
		.where(sql`hash is null and url is not null and ${db_backoff_sql(schema.images, schema.images.url, 'images.download.images')}`)
		.all()

	const pc = new ProgressRef('images.download.images')

	await run_with_concurrency_limit(urls, 5, pc, async ({ rowid, url }) => {
		const resp = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			}
		})

		if (!resp.ok) {
			db_register_backoff(schema.images, url, 'images.download.images')
			return
		}

		const ext = mime_ext(resp.headers.get("content-type"))
		const [file, hash] = db_fs_sharded_lazy_bunfile(ext)

		await Bun.write(file, resp)

		db.update(schema.images)
			.set({ hash: hash })
			.where(sql`rowid = ${rowid}`)
			.run()
		update = true
	})

	pc.close()

	return update
}