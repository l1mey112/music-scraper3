import { drizzle } from 'drizzle-orm/bun-sqlite'
import { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'

const sqlite: Database = new Database('db.sqlite', { create: false, readwrite: true })

// https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
sqlite.exec("pragma journal_mode = WAL;")
sqlite.exec("pragma synchronous = normal;") // safe with WAL

export const db: BunSQLiteDatabase<typeof schema> = drizzle(sqlite, { schema })

process.on("beforeExit", (code) => {
	try {
		sqlite.exec("pragma wal_checkpoint(TRUNCATE);") // checkpoint WAL
		sqlite.exec("pragma journal_mode = DELETE;") // delete wal
		sqlite.exec("pragma vacuum;") // vacuum
		sqlite.exec("pragma optimize;") // optimize
		sqlite.exec("pragma analysis_limit=1000;") // 1000 iterations
		sqlite.close() // close the db
	} catch {
		//
	}
})
