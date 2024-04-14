#!/usr/bin/env bun

import { sql } from "drizzle-orm";
import { db, db_close } from "../db";
import { $links } from '../schema'

const k = db.select()
	.from($links)
	.where(sql`${$links.kind} = 'unknown'`)
	.all()

for (const { data } of k) {
	console.log(data)
}

db_close()