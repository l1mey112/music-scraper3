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

export const db: BunSQLiteDatabase<typeof schema> = drizzle(sqlite, { schema, logger: false })

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

type IdentPart = keyof typeof ident_match

const ident_match = {
	'yv/': $youtube_video,
	'yc/': $youtube_channel,
	'im/': $images,
	'so/': $sources,
	'ka/': $karent_album,
	'kr/': $karent_artist,
	'st/': $spotify_track,
	'sa/': $spotify_album,
	'sr/': $spotify_artist,
	'lk/': $links,
	'vs/': $vocadb_song,
	'va/': $vocadb_album,
	'vr/': $vocadb_artist,
}

// reverse map, mapping values to keys
// need to use map, objects cant be used as object keys
const reverse_map = new Map<SQLiteTable, IdentPart>(Object.entries(ident_match).map(([k, v]) => [v, k] as [SQLiteTable, IdentPart]))

export function ident_pk(table: SQLiteTable, id: string | number): Ident
export function ident_pk(table: SQLiteTable): IdentPart

export function ident_pk(table: SQLiteTable, id?: string | number) {
	const ident = reverse_map.get(table)
	if (ident === undefined) {
		throw new Error(`unknown table ${table} (${table._.name})`)
	}
	if (id) {
		return (ident + id) as Ident
	}
	return ident
}

export function ident_pk_reverse(ident: Ident): [string, SQLiteTable] {
	const part = ident.slice(0, 3) as IdentPart
	const table = ident_match[part]
	if (!table) {
		throw new Error(`unknown ident part ${part} (${ident})`)
	}
	return [ident.slice(3), table]
}
