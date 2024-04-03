import { index, sqliteTable, text, integer, SQLiteTable, primaryKey, unique } from "drizzle-orm/sqlite-core";
import { DBHash, ImageKind, PIdent, YoutubeChannelId, YoutubeVideoId } from "./types";

// .references(() => youtube_channel.id),
// these are no-ops in sqlite with drizles configuration, they don't create indexes
// a default index is created on primary keys anyway

// WITHOUT-ROWID: youtube_video
export const youtube_video = sqliteTable('youtube_video', {
	id: text('id').$type<YoutubeVideoId>().primaryKey(),
	channel_id: text('channel_id').$type<YoutubeChannelId>(),

	name: text('name'),
	description: text('description'),
})

// WITHOUT-ROWID: youtube_channel
export const youtube_channel = sqliteTable('youtube_channel', {
	id: text('id').$type<YoutubeChannelId>().primaryKey(),

	name: text('name'), // display name
	handle: text('handle'), // @pinocchiop
	description: text('description'),
})

// pass backoff for metadata
export const pass_backoff = sqliteTable('pass_backoff', {
	utc: integer('utc').notNull(),

	ident: text('ident').$type<PIdent>().notNull(),
	pass: integer('pass').$type<DBHash>().notNull(), // wyhash integer
}, (t) => ({
	pidx: index("pass_backoff.ident_idx").on(t.ident),
}))

// persistent store
// WITHOUT-ROWID: thirdparty:store
export const thirdparty_store = sqliteTable('thirdparty:store', {
	kind: text('kind').primaryKey(),
	data: text('data', { mode: 'json' }).notNull(),
})

export const links = sqliteTable('links', {
	id: integer('id').primaryKey(),
	derived_from: integer('derived_from'), // foreign key to links.id
	ident: text('ident').$type<PIdent>().notNull(),
	kind: text('kind').notNull(),
	data: text('data').notNull(),
}, (t) => ({
	pidx: index("links.ident_idx").on(t.ident),
	unique: unique().on(t.ident, t.kind, t.data, t.derived_from),
}))

//          | hash | null hash
// ---------+------|-----------
// url      |  o   |  o
// null url |  o   |  x

// TODO: WITHOUT ROWID tables can't have nulls in the PKs?
//       this might throw badly

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
