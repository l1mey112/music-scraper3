#!/usr/bin/env bun

import { sql } from "drizzle-orm";
import { db, db_close } from "../db";
import * as schema from '../schema'

const k = db.select()
	.from(schema.links)
	.where(sql`${schema.links.kind} = 'unknown'`)
	.all()

for (const { data } of k) {
	console.log(data)
}

db_close()