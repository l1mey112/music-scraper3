import { index, sqliteTable, text, integer, unique, blob, real } from "drizzle-orm/sqlite-core";
import { LiteralHash, ImageKind, PIdent, YoutubeChannelId, YoutubeVideoId, FSHash } from "./types";

// .references(() => youtube_channel.id),
// these are no-ops in sqlite, they don't create indexes
// a default index is created on primary keys anyway

export const track = sqliteTable('track', {
	id: integer('id').primaryKey(),
})

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
	pass: integer('pass').$type<LiteralHash>().notNull(), // wyhash integer
}, (t) => ({
	pidx: index("pass_backoff.ident_idx").on(t.ident),
}))

// persistent store
// WITHOUT-ROWID: thirdparty:store
export const thirdparty_store = sqliteTable('thirdparty:store', {
	kind: text('kind').primaryKey(),
	data: text('data', { mode: 'json' }).notNull(),
})

// `id` is the backoff PK

export const links = sqliteTable('links', {
	id: integer('id').primaryKey(),
	derived_from: integer('derived_from'), // foreign key to links.id
	ident: text('ident').$type<PIdent>().notNull(),
	kind: text('kind').notNull(),
	data: text('data').notNull(),
}, (t) => ({
	pidx: index("links.ident_idx").on(t.ident),
}))

//          | hash | null hash
// ---------+------|-----------
// url      |  o   |  o
// null url |  o   |  x

// `url` is the backoff PK

// sources don't have `kind` or `url`, possibly deprecate `url` in images
// though it's useful for batching in another pass since one single article
// can have a LOT of images (> 5 possibly)
//
// making `hash` non null would allow a proper PK and no row id table
// please look into this.

// TODO: tbh make `hash` a URL then gate it behind a pass
//       if it fails, no backoff just delete the entry
//       check if starts with https:// or http:// (nanoid has no //)

// relies on rowid
export const images = sqliteTable('images', {
	hash: text('hash').$type<FSHash>(),
	url: text('url'),
	ident: text('ident').$type<PIdent>().notNull(),
	kind: text('kind').$type<ImageKind>().notNull(),
	width: integer('width').notNull(),
	height: integer('height').notNull(),
}, (t) => ({
	pkidx0: index("images.pkidx0").on(t.hash), // ????
	pkidx1: index("images.pkidx1").on(t.url),  // ????
	pidx: index("images.ident_idx").on(t.ident),
}))

// `width` and `height` are optional, they are only present in video sources

// chromaprint is a 32-bit integer array, usually bounded by 120 seconds or less
// this doesn't represent the entire length of the audio
// one second is ~7.8 uint32s
//
// compression of a chromaprint is a BAD idea, the entropy is already way too high
// i tried, you'll save 100 bytes in 4000, not worth it

// CHANGED: for now, chromaprint is in compressed base64 URL safe format
//          IGNORE ALL ABOVE WITHIN REASON

// a source is a video/audio file, always containing some form of audio
// WITHOUT-ROWID: sources
export const sources = sqliteTable('sources', {
	hash: text('hash').primaryKey().$type<FSHash>(),
	ident: text('ident').$type<PIdent>().notNull(),
	chromaprint: text('chromaprint'),
	chromaprint_duration: integer('chromaprint_duration'),
	acoustid: text('acoustid'),
	width: integer('width'),
	height: integer('height'),
}, (t) => ({
	pidx: index("sources.ident_idx").on(t.ident),
}))
