#!/usr/bin/env bun

import { sql } from "drizzle-orm";
import { db, db_close } from "../db";
import { $links } from '../schema'
import { parse } from "tldts";

const k = db.select()
	.from($links)
	.where(sql`${$links.kind} = 'unknown'`)
	.all()

const domains = new Set<string>()

for (const { data } of k) {
	const { hostname } = parse(data)
	if (hostname) {
		domains.add(hostname)
	}
}

for (const domain of domains) {
	console.log(domain)
}

db_close()