import { unique, sqliteTable, text, integer, SQLiteTable } from "drizzle-orm/sqlite-core";
import { ImageKind, PIdent, YoutubeChannelId, YoutubeVideoId } from "./types";

// WITHOUT-ROWID: youtube_video
export const youtube_video = sqliteTable('youtube_video', {
	id: text('id').$type<YoutubeVideoId>().primaryKey(),
	channel_id: text('channel_id').$type<YoutubeChannelId>().references(() => youtube_channel.id),

	name: text('name'),
	description: text('description'),
	description_links: text('links', { mode: "json" }).$type<string[]>(),
})

// WITHOUT-ROWID: youtube_channel
export const youtube_channel = sqliteTable('youtube_channel', {
	id: text('id').$type<YoutubeChannelId>().primaryKey(),

	handle: text('handle'), // @pinocchiop
	name: text('name'),
	description: text('description'),
	links: text('links', { mode: "json" }).$type<string[]>(),
})

// pass backoff for metadata
// WITHOUT-ROWID: pass_backoff
export const pass_backoff = sqliteTable('pass_backoff', {
	utc: integer('utc').primaryKey(),

	ident: text('ident').$type<PIdent>().notNull(), // TODO: needs index
	pass: integer('pass').notNull(), // wyhash integer
})

// persistent store
// WITHOUT-ROWID: thirdparty:store
export const thirdparty_store = sqliteTable('thirdparty:store', {
	kind: text('kind').primaryKey(),
	data: text('data', { mode: 'json' }).notNull(),
})

//          | hash | null hash
// ---------+------|-----------
// url      |  o   |  o
// null url |  o   |  x

// imageFS is lazy
// WITHOUT-ROWID: image_fs
export const image_fs = sqliteTable('image_fs', {
	hash: text('hash'),
	url: text('url'),
	ident: text('ident').$type<PIdent>().notNull(), // TODO: needs index
	kind: text('kind').$type<ImageKind>().notNull(),
	width: integer('width').notNull(),
	height: integer('height').notNull(),
}, (t) => ({
	unq: unique().on(t.hash, t.url)
}))

export function permanent_ident(column: SQLiteTable, id: number): PIdent {
	let ppid
	
	switch (column) {
		case youtube_video: ppid = 'yv'; break
		case youtube_channel: ppid = 'yc'; break
		default: throw new Error(`unknown column ${column}`)
	}
	
	return ppid + id
}
