import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { FSHash, ImageKind } from "../types";
import * as schema from '../schema'
import { db, db_ident_pk } from "../db";
import { db_backoff_sql, db_fs_sharded_lazy_bunfile, db_backoff } from "../db_misc";
import { sql } from "drizzle-orm";
import { run_with_concurrency_limit } from "../pass";
import { ProgressRef } from "../server";
import { mime_ext } from "../mime";

// images with hash as a URL will be weeded out in further passes
export function db_images_append_url(pk: SQLiteTable, pk_id: string | number, kind: ImageKind, url: string, width: number, height: number) {
	db.insert(schema.images)
		.values({
			hash: url as FSHash,
			ident: db_ident_pk(pk) + pk_id,
			kind: kind,
			width: width,
			height: height,
		})
		.onConflictDoNothing()
		.run()
}

// images.download.url_to_hash
export async function pass_images_download_url_to_hash() {
	// case exact glob results in "SEARCH"ing through using our index
	let update = false
	const urls = db.select({ hash: schema.images.hash })
		.from(schema.images)
		.where(sql`hash glob 'http://*' or hash glob 'https://*'`)
		.all()

	const pc = new ProgressRef('images.download.url_to_hash')

	await run_with_concurrency_limit(urls, 5, pc, async ({ hash }) => {
		const resp = await fetch(hash, {
			headers: {
				"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			}
		})

		if (!resp.ok) {
			// delete the entry
			db.delete(schema.images)
				.where(sql`hash = ${hash}`)
				.run()
			return
		}

		const ext = mime_ext(resp.headers.get("content-type"))
		const [file, new_hash] = db_fs_sharded_lazy_bunfile(ext)

		await Bun.write(file, resp)

		console.log(`downloaded ${hash} to ${file}`)

		// update in place
		db.update(schema.images)
			.set({ hash: new_hash })
			.where(sql`hash = ${hash}`)
			.run()
		update = true
	})

	pc.close()

	return update
}