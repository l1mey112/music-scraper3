import { FSRef, Ident, ImageKind } from "../types"
import { db } from "../db"
import { db_fs_hash_path, db_fs_sharded_lazy_bunfile } from "../db_misc"
import { sql } from "drizzle-orm"
import { ProgressRef } from "../server"
import { mime_ext } from "../mime"
import { run_with_concurrency_limit } from "../util"
import { $images } from "../schema"
import sizeOf from 'image-size'

// images with hash as a URL will be weeded out in further passes
export function db_images_append_url(ident: Ident, kind: ImageKind, url: string, width: number, height: number) {
	db.insert($images)
		.values({
			hash: url as FSRef,
			ident,
			kind,
			width,
			height,
		})
		.onConflictDoNothing()
		.run()
}

// images with hash as a URL will be weeded out in further passes
// will extract image dimensions from the response in that pass
export function db_images_append_url_without_dimensions(ident: Ident, kind: ImageKind, url: string) {
	db.insert($images)
		.values({
			hash: url as FSRef,
			ident,
			kind,
			width: 0,
			height: 0,
		})
		.onConflictDoNothing()
		.run()
}

// images.download.url_to_hash
export async function pass_images_download_url_to_hash() {
	// case exact glob results in "SEARCH"ing through using our index
	let update = false
	const urls = db.select({ hash: $images.hash, width: $images.width, height: $images.height })
		.from($images)
		.where(sql`hash glob 'http://*' or hash glob 'https://*'`)
		.all()

	const pc = new ProgressRef('images.download.url_to_hash')

	await run_with_concurrency_limit(urls, 5, pc, async (image) => {
		const resp = await fetch(image.hash, {
			headers: {
				"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			}
		})

		if (!resp.ok) {
			// delete the entry
			db.delete($images)
				.where(sql`hash = ${image.hash}`)
				.run()
			return
		}

		const needs_dimensions = image.width == 0 || image.height == 0

		const ext = mime_ext(resp.headers.get("content-type"))
		const [file, new_hash] = db_fs_sharded_lazy_bunfile(ext)

		await Bun.write(file, resp)

		let new_width = image.width
		let new_height = image.height

		if (needs_dimensions) {
			const size = sizeOf(db_fs_hash_path(new_hash))

			if (!size.width || !size.height) {
				// so damn rare
				throw new Error(`sizeOf returned no width or height for ${new_hash}`)
			}

			new_width = size.width
			new_height = size.height
		}

		// update in place
		db.update($images)
			.set({ hash: new_hash, width: new_width, height: new_height })
			.where(sql`hash = ${image.hash}`)
			.run()

		update = true
	})

	pc.close()

	return update
}