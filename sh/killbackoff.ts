#!/usr/bin/env bun

import { sql } from "drizzle-orm";
import { db, db_close, db_hash } from "../db";
import * as schema from '../schema'

const k = process.argv[2]

if (!k) {
	console.error('missing pass name')
	process.exit(1)
}

const hash = db_hash(k)

console.log(`deleting backoff for pass ${k} (${hash})`)

/* const d = db.delete(schema.pass_backoff)
	.where(sql`${schema.pass_backoff.pass} = ${hash}`)
	.returning({ count: sql<number>`count(*)` })
	.all()

console.log(`deleted ${d.count} backoff entries`) */

const st = db.delete(schema.pass_backoff)
	.where(sql`${schema.pass_backoff.pass} = ${hash}`)
	.returning()
	.all()

console.log(`deleted ${st.length} backoff entries`)

db_close()