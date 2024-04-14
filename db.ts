import { drizzle } from 'drizzle-orm/bun-sqlite'
import { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'
import { $spotify_artist, $spotify_album, $youtube_video, $youtube_channel, $images, $sources, $karent_album, $karent_artist, $links, $spotify_track, $vocadb_song, $vocadb_album, $vocadb_artist } from './schema'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { Ident } from './types'

const sqlite: Database = new Database('db.sqlite', { create: false, readwrite: true })

// https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
sqlite.exec("pragma journal_mode = WAL;")
sqlite.exec("pragma synchronous = normal;") // safe with WAL
sqlite.exec("pragma temp_store = memory;")
sqlite.exec("pragma mmap_size = 30000000000;")
//sqlite.exec("pragma auto_vacuum = incremental;") // TODO: needs to be set at db creation before tables, so why call it here?
sqlite.loadExtension("./chromaprint") // chromaprint.c

export const db: BunSQLiteDatabase<typeof schema> = drizzle(sqlite, { schema })

export function db_close() {
	sqlite.exec("pragma wal_checkpoint(TRUNCATE);") // checkpoint WAL
	sqlite.exec("pragma journal_mode = DELETE;") // delete wal
	sqlite.exec("pragma vacuum;") // vacuum
	sqlite.exec("pragma analysis_limit = 0;") // complete scan to generate sqlite_stat4
	sqlite.exec("pragma optimize;") // optimize
	sqlite.exec("analyze;") // run opt
	sqlite.close() // close the db
	console.log('db: closed')
}

const WYHASH_SEED = 761864364875522238n

// ensure lengths are 3
export function db_ident_pk(table: SQLiteTable) {
	switch (table) {
		case $youtube_video:   return 'yv/'
		case $youtube_channel: return 'yc/'
		case $images:          return 'im/'
		case $sources:         return 'so/'
		case $karent_album:    return 'ka/'
		case $karent_artist:   return 'kr/'
		case $spotify_track:   return 'st/'
		case $spotify_album:   return 'sa/'
		case $spotify_artist:  return 'sr/'
		case $links:		   return 'lk/'
		case $vocadb_song:     return 'vs'
		case $vocadb_album:    return 'va'
		case $vocadb_artist:   return 'vr'
		default: {
			throw new Error(`unknown table ${table}`)
		}
	}
}

export function db_ident_pk_with(table: SQLiteTable, id: string | number): Ident {
	return (db_ident_pk(table) + id) as Ident
}
