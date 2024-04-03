import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from './schema'
import { DBHash } from "./types"

const WYHASH_SEED = 761864364875522238n

export function db_hash(s: string): DBHash {
	return Bun.hash.wyhash(s, WYHASH_SEED) as DBHash
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
