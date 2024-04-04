import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { FSHash, LiteralHash } from "./types"
import { BunFile } from "bun";
import { nanoid } from "./nanoid";
import { resolve } from "path";
import { existsSync, mkdirSync, statSync } from "fs";
import * as schema from './schema'
import { db } from './db';

const WYHASH_SEED = 761864364875522238n

export function db_hash(s: string): LiteralHash {
	return Bun.hash.wyhash(s, WYHASH_SEED) as LiteralHash
}

export function db_ident_pk(sqlt: SQLiteTable) {
	switch (sqlt) {
		case schema.youtube_video:   return 'yv/'
		case schema.youtube_channel: return 'yc/'
		default: {
			throw new Error(`unknown table ${sqlt}`)
		}
	}
}

const media_db = resolve("db")

if (!existsSync(media_db)) {
	mkdirSync(media_db)
} else if (!statSync(media_db).isDirectory()) {
	console.error(`media directory exists but is not a directory (at ${media_db})`)
	process.exit(1)
}

export function db_fs_sharded_lazy_bunfile(dot_ext: string): [BunFile, FSHash] {
	const [path, hash] = db_fs_sharded_path(dot_ext)
	return [Bun.file(path), hash]
}

export function db_fs_sharded_path(dot_ext: string): [string, FSHash] {
	const hash = (nanoid() + dot_ext) as FSHash
	const shard = hash.slice(0, 2)

	// bun automatically creates folders
	return [`${media_db}/${shard}/${hash}`, hash]
}

export function db_links_append(pk: SQLiteTable, pk_id: string | number, urls: string[]) {
	if (urls.length === 0) {
		return
	}

	const links = urls.map((url) => ({
		ident: db_ident_pk(pk) + pk_id,
		kind: 'unknown',
		data: url,
	}))

	db.insert(schema.links)
		.values(links)
		.onConflictDoNothing()
		.run()
}
