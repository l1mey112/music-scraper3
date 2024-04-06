import { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { FSHash, PassIdentifier } from "./types"
import { BunFile } from "bun";
import { nanoid } from "./nanoid";
import { resolve } from "path";
import { existsSync, mkdirSync, statSync } from "fs";
import * as schema from './schema'
import { db, db_hash, db_ident_pk } from './db';
import { SQL, sql } from 'drizzle-orm';
import { emit_log } from './server';

const media_db = resolve("db")

if (!existsSync(media_db)) {
	mkdirSync(media_db)
} else if (!statSync(media_db).isDirectory()) {
	console.error(`media directory exists but is not a directory (at ${media_db})`)
	process.exit(1)
}

export function db_fs_hash_path(hash: FSHash): string {
	const shard = (hash as unknown as string).slice(0, 2)
	return `${media_db}/${shard}/${hash}`
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

// append your own extension
// creates the shard folder
export function db_fs_sharded_path_noext_nonlazy(): [string, string] {
	const hash = nanoid() as FSHash
	const shard = hash.slice(0, 2)

	mkdirSync(`${media_db}/${shard}`, { recursive: true })

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

export function db_register_backoff(pk: SQLiteTable, pk_id: string | number, pass: PassIdentifier) {
	const ident_fk = db_ident_pk(pk) + pk_id

	emit_log(`pass <i>${pass}</i> failed for <i>${ident_fk}</i>`)

	db.insert(schema.pass_backoff)
		.values({ utc: Date.now(), ident: ident_fk, pass: db_hash(pass) })
		.run()
}

export function db_backoff_sql(pk: SQLiteTable, pk_column: SQLiteColumn | string, pass: PassIdentifier): SQL<boolean> {
	const ident = db_ident_pk(pk)

	return sql<boolean>`(${ident} || ${pk_column}) not in (
		select ${schema.pass_backoff.ident} from ${schema.pass_backoff} where ${schema.pass_backoff.pass} = ${db_hash(pass)}
	)`
}
