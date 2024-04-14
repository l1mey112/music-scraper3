#!/usr/bin/env bun

import { sql } from "drizzle-orm";
import { db, db_close } from "../db";
import { $retry_backoff } from '../schema'
import { wyhash } from "../util";

const k = process.argv[2]

if (!k) {
	console.error('missing pass name')
	process.exit(1)
}

const hash = wyhash(k)

console.log(`deleting backoff for pass ${k} (${hash})`)

const st = db.delete($retry_backoff)
	.where(sql`${$retry_backoff.pass} = ${hash}`)
	.returning()
	.all()

console.log(`deleted ${st.length} backoff entries`)

db_close()