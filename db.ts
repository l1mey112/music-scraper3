import { drizzle } from 'drizzle-orm/bun-sqlite'
import { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'
import { LiteralHash, UniFK } from './types'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'

const sqlite: Database = new Database('db.sqlite', { create: false, readwrite: true })

// https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
sqlite.exec("pragma journal_mode = WAL;")
sqlite.exec("pragma synchronous = normal;") // safe with WAL
sqlite.exec("pragma temp_store = memory;")
sqlite.exec("pragma auto_vacuum = incremental;") // TODO: needs to be set at db creation before tables, so why call it here?
sqlite.loadExtension("./hdist.so") // hdist.c

export const db: BunSQLiteDatabase<typeof schema> = drizzle(sqlite, { schema })

export function db_close() {
	sqlite.exec("pragma wal_checkpoint(TRUNCATE);") // checkpoint WAL
	sqlite.exec("pragma journal_mode = DELETE;") // delete wal
	sqlite.exec("pragma vacuum;") // vacuum
	sqlite.exec("pragma optimize;") // optimize
	sqlite.exec("pragma analysis_limit=4000;") // 4000 iterations
	sqlite.close() // close the db
	console.log('db: closed')
}

const WYHASH_SEED = 761864364875522238n

export function db_hash(s: string): LiteralHash {
	return Bun.hash.wyhash(s, WYHASH_SEED) as LiteralHash
}

// ensure lengths are 3
export function db_ident_pk(table: SQLiteTable) {
	switch (table) {
		case schema.youtube_video:   return 'yv/'
		case schema.youtube_channel: return 'yc/'
		case schema.images:          return 'im/'
		case schema.sources:         return 'so/'
		case schema.karent_album:    return 'kl/'
		case schema.karent_artist:   return 'ka/'
		default: {
			throw new Error(`unknown table ${table}`)
		}
	}
}

export function db_ident_pk_with(table: SQLiteTable, id: string | number): UniFK {
	return (db_ident_pk(table) + id) as UniFK
}
