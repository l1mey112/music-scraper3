import { index, sqliteTable, text, integer, SQLiteTable, primaryKey } from "drizzle-orm/sqlite-core";
import { ImageKind, PIdent, YoutubeChannelId, YoutubeVideoId } from "./types";

// WITHOUT-ROWID: youtube_video
export const youtube_video = sqliteTable('youtube_video', {
	id: text('id').$type<YoutubeVideoId>().primaryKey(),
	channel_id: text('channel_id').$type<YoutubeChannelId>().references(() => youtube_channel.id),

	name: text('name'),
	description: text('description'),
	description_links: text('description_links', { mode: "json" }).$type<string[]>(),
})

// WITHOUT-ROWID: youtube_channel
export const youtube_channel = sqliteTable('youtube_channel', {
	id: text('id').$type<YoutubeChannelId>().primaryKey(),

	name: text('name'), // display name
	handle: text('handle'), // @pinocchiop
	description: text('description'),
	links: text('links', { mode: "json" }).$type<string[]>(),
})

// pass backoff for metadata
export const pass_backoff = sqliteTable('pass_backoff', {
	utc: integer('utc').notNull(),

	ident: text('ident').$type<PIdent>().notNull(),
	pass: integer('pass').notNull(), // wyhash integer
}, (t) => ({
	pidx: index("pass_backoff.ident_idx").on(t.ident),
}))

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
	ident: text('ident').$type<PIdent>().notNull(),
	kind: text('kind').$type<ImageKind>().notNull(),
	width: integer('width').notNull(),
	height: integer('height').notNull(),
}, (t) => ({
	pk: primaryKey({ columns: [t.hash, t.url] }),
	pidx: index("image_fs.ident_idx").on(t.ident),
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
