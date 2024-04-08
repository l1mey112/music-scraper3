import * as schema from '../schema'
import { db } from "../db"
import { sql } from 'drizzle-orm'

const k = db.select({ chromaprint: schema.sources.chromaprint })
	.from(schema.sources)
	.where(sql`${schema.sources.chromaprint} is not null`)
	.all()

for (const { chromaprint } of k) {
	const buf = new Uint8Array(chromaprint!.buffer)
	const com = Bun.deflateSync(buf, { level: 9 })

	console.log('uncompressed', buf.length)
	console.log('compressed', com.length)
	console.log('diff', buf.length - com.length)
}