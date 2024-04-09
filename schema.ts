import { index, sqliteTable, text, integer, blob, real, unique, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { LiteralHash, ImageKind, PIdent, YoutubeChannelId, YoutubeVideoId, FSHash, SpotifyArtistId, SpotifyAlbumId, SpotifyTrackId, KarentAlbumId } from "./types";

// .references(() => youtube_channel.id),
// these are no-ops in sqlite, they don't create indexes
// a default index is created on primary keys anyway

// WITHOUT-ROWID: karent_artist
export const karent_artist = sqliteTable('karent_artist', {
	id: text('id').$type<KarentAlbumId>().primaryKey(),
})

// WITHOUT-ROWID: karent_album
export const karent_album = sqliteTable('karent_album', {
	id: text('id').$type<KarentAlbumId>().primaryKey(),
})

// WITHOUT-ROWID: spotify_artist
export const spotify_artist = sqliteTable('spotify_artist', {
	id: text('id').$type<SpotifyArtistId>().primaryKey(),

	//name: text('name'),
})

// WITHOUT-ROWID: spotify_album
export const spotify_album = sqliteTable('spotify_album', {
	id: text('id').$type<SpotifyAlbumId>().primaryKey(),

	//name: text('name'),
})

// WITHOUT-ROWID: spotify_track
export const spotify_track = sqliteTable('spotify_track', {
	id: text('id').$type<SpotifyTrackId>().primaryKey(),

	//name: text('name'),
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
// its safe to clear these out, it'll just cause a re-fetch
// there is no race conditions if you ran a cleanup pass at the end, you're at no risk
export const pass_backoff = sqliteTable('pass_backoff', {
	issued: integer('issued').notNull(),
	expire: integer('expire').notNull(),

	ident: text('ident').$type<PIdent>().notNull(),
	pass: integer('pass').$type<LiteralHash>().notNull(), // wyhash integer
}, (t) => ({
	pidx: index("pass_backoff.full_idx").on(t.ident, t.expire, t.pass),
}))

// persistent store
// WITHOUT-ROWID: thirdparty:store
export const thirdparty_store = sqliteTable('thirdparty:store', {
	kind: text('kind').primaryKey(),
	data: text('data', { mode: 'json' }).notNull(),
})

// ~~rowid simplifies deletions~~
// WITHOUT-ROWID: links
export const links = sqliteTable('links', {
	ident: text('ident').$type<PIdent>().notNull(),
	kind: text('kind').notNull(),
	data: text('data').notNull(),
}, (t) => ({
	pidxuni: primaryKey({ columns: [t.ident, t.kind, t.data] }),
}))

// hash can either be an FSHash or a URL gated behind a pass to defer downloading
// if it fails, no backoff just delete the entry
// check if starts with https:// or http:// (nanoid has no //)

// WITHOUT-ROWID: images
export const images = sqliteTable('images', {
	hash: text('hash').$type<FSHash>().primaryKey(),
	ident: text('ident').$type<PIdent>().notNull(),
	kind: text('kind').$type<ImageKind>().notNull(),
	width: integer('width').notNull(),
	height: integer('height').notNull(),
}, (t) => ({
	pkidx: index("images.ident_idx").on(t.ident, t.hash),
}))

// `width` and `height` are optional, they are only present in video sources

// chromaprint is a 32-bit integer array, usually bounded by 120 seconds or less
// this doesn't represent the entire length of the audio
// one second is ~7.8 uint32s
//
// compression of a chromaprint is a BAD idea, the entropy is already way too high
// i tried, you'll save 100 bytes in 4000, not worth it

// TODO: look into indices, i doubt it'll help chromaprint matching
//       but on duration it'll definitely help since we're doing a range query

// a source is a video/audio file, always containing some form of audio
// WITHOUT-ROWID: sources
export const sources = sqliteTable('sources', {
	hash: text('hash').$type<FSHash>().primaryKey(),
	ident: text('ident').$type<PIdent>().notNull(),
	duration_s: real('duration_s').notNull(), // not entirely accurate, but close enough
	chromaprint: blob('chromaprint').$type<Uint8Array>(),
	width: integer('width'),
	height: integer('height'),
}, (t) => ({
	pidx: index("sources.ident_idx").on(t.ident),
}))
