import { SQLiteColumn, SQLiteTable, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core'
import { FSRef, Link, PassIdentifier } from "./types"
import { wyhash } from "./util";
import { BunFile } from "bun";
import { nanoid } from "./nanoid";
import { resolve } from "path";
import { existsSync, mkdirSync, statSync } from "fs";
import { $links } from './schema'
import { db, ident_pk } from './db';

const media_db = resolve("db")

if (!existsSync(media_db)) {
	mkdirSync(media_db)
} else if (!statSync(media_db).isDirectory()) {
	console.error(`media directory exists but is not a directory (at ${media_db})`)
	process.exit(1)
}

export function fs_hash_path(hash: FSRef): string {
	// rare
	if (hash.startsWith("https://") || hash.startsWith("http://")) {
		throw new Error("hash is a url")
	}
	const shard = (hash as unknown as string).slice(0, 2)
	return `${media_db}/${shard}/${hash}`
}

export function fs_sharded_lazy_bunfile(dot_ext: string): [BunFile, FSRef] {
	const [path, hash] = fs_sharded_path(dot_ext)
	return [Bun.file(path), hash]
}

export function fs_sharded_path(dot_ext: string): [string, FSRef] {
	const hash = (nanoid() + dot_ext) as FSRef
	const shard = hash.slice(0, 2)

	// bun automatically creates folders
	return [`${media_db}/${shard}/${hash}`, hash]
}

// append your own extension
// creates the shard folder
export function fs_sharded_path_noext_nonlazy(): [string, string] {
	const hash = nanoid() as FSRef
	const shard = hash.slice(0, 2)

	mkdirSync(`${media_db}/${shard}`, { recursive: true })

	return [`${media_db}/${shard}/${hash}`, hash]
}

export function fs_sharded_path_nonlazy(dot_ext: string): [string, FSRef] {
	const hash = (nanoid() + dot_ext) as FSRef
	const shard = hash.slice(0, 2)

	mkdirSync(`${media_db}/${shard}`, { recursive: true })

	// bun automatically creates folders
	return [`${media_db}/${shard}/${hash}`, hash]
}
