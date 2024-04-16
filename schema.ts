import { index, sqliteTable, text, integer, blob, real, unique, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { WyHash, ImageKind, Ident, YoutubeChannelId, YoutubeVideoId, FSRef, SpotifyArtistId, SpotifyAlbumId, SpotifyTrackId, TrackId, AudioFingerprintId, LinkKind, KarentAlbumId, KarentArtistId, LocalePart, AlbumId, ArtistId, LocaleRef, LinkId, ArtistList, VocaDBSongId, VocaDBAlbumId, VocaDBArtistId, AlbumTracks } from "./types";
import { sql } from "drizzle-orm";

// .references(() => youtube_channel.id),
// these are no-ops in sqlite, they don't create indexes
// a default index is created on primary keys anyway

export const $track = sqliteTable('track', {
	id: integer('id').$type<TrackId>().primaryKey(),

	// more fields...
})

// TODO: needs joining table
export const $album = sqliteTable('album', {
	id: integer('id').$type<AlbumId>().primaryKey(),

	// more fields...
})

export const $artist = sqliteTable('artist', {
	id: integer('id').$type<ArtistId>().primaryKey(),

	// more fields...
})

// TODO: it would be nice to have a nullable `locale` instead of `--`
//       null isn't comparable to anything, so it works fine

// WITHOUT-ROWID: locale
export const $locale = sqliteTable('locale', {
	ident: text('ident').$type<Ident>().notNull(),
	locale: text('locale').$type<LocaleRef>().notNull(),
	part: integer('part').$type<LocalePart>().notNull(),
	text: text('text').notNull(),
}, (t) => ({
	pk: primaryKey({ columns: [t.ident, t.locale, t.part] }),
}))

// compound unique works on columns individually, which is fucking stupid
// you need to use composite primary key

// for a unique id we have two choices
// 1. randomised integer
// 2. hash the three fields

export const $links = sqliteTable('links', {
	id: integer('id').$type<LinkId>().primaryKey(),
	ident: text('ident').$type<Ident>().notNull(),
	kind: text('kind').$type<LinkKind>().notNull(),
	data: text('data').notNull(),
}, (t) => ({
	uniq: unique('links.uniq').on(t.ident, t.kind, t.data)
}))

// WITHOUT-ROWID: karent_artist
export const $karent_artist = sqliteTable('karent_artist', {
	id: text('id').$type<KarentArtistId>().primaryKey(),
	artist_id: integer('artist_id').$type<ArtistId>(),
})

// WITHOUT-ROWID: karent_album
export const $karent_album = sqliteTable('karent_album', {
	id: text('id').$type<KarentAlbumId>().primaryKey(),
	album_id: integer('album_id').$type<AlbumId>(),
})

// WITHOUT-ROWID: spotify_artist
export const $spotify_artist = sqliteTable('spotify_artist', {
	id: text('id').$type<SpotifyArtistId>().primaryKey(),
	artist_id: integer('artist_id').$type<ArtistId>(),

	spotify_genres: text('spotify_genres', { mode: 'json' }).$type<string[]>(),
	spotify_followers: integer('spotify_followers'),
	spotify_monthly_listeners: integer('spotify_monthly_listeners'),
	spotify_avatar_extracted_colour_dark: text('spotify_avatar_extracted_colour_dark'), // #hex (prepended #)
	spotify_avatar_extracted_colour_raw: text('spotify_avatar_extracted_colour_raw'), // #hex (prepended #)
})

// WITHOUT-ROWID: spotify_album
export const $spotify_album = sqliteTable('spotify_album', {
	id: text('id').$type<SpotifyAlbumId>().primaryKey(),
	album_id: integer('album_id').$type<AlbumId>(),

	spotify_track_count: integer('spotify_track_count'),
})

// WITHOUT-ROWID: spotify_track
export const $spotify_track = sqliteTable('spotify_track', {
	id: text('id').$type<SpotifyTrackId>().primaryKey(),
	track_id: integer('track_id').$type<TrackId>(),

	spotify_preview_url: text('spotify_preview_url'),
	spotify_disc_number: integer('spotify_disc_number'),
	spotify_track_number: integer('spotify_track_number'),
	spotify_album_id: text('spotify_album_id').$type<SpotifyAlbumId>(),
	spotify_isrc: text('spotify_isrc'),
})

// WITHOUT-ROWID: youtube_video
export const $youtube_video = sqliteTable('youtube_video', {
	id: text('id').$type<YoutubeVideoId>().primaryKey(),
	track_id: integer('track_id').$type<TrackId>(),

	channel_id: text('channel_id').$type<YoutubeChannelId>(),
})

// WITHOUT-ROWID: youtube_channel
export const $youtube_channel = sqliteTable('youtube_channel', {
	id: text('id').$type<YoutubeChannelId>().primaryKey(),
	artist_id: integer('artist_id').$type<ArtistId>(),

	handle: text('handle'), // @pinocchiop
})

// WITHOUT-ROWID: vocadb_song
export const $vocadb_song = sqliteTable('vocadb_song', {
	id: integer('id').$type<VocaDBSongId>().primaryKey(),
	track_id: integer('track_id').$type<TrackId>(),

	vocadb_artists: text('vocadb_artists', { mode: 'json' }).$type<ArtistList<VocaDBArtistId>>(),
	vocadb_albums: text('vocadb_albums', { mode: 'json' }).$type<VocaDBAlbumId[]>(),
})

// WITHOUT-ROWID: vocadb_album
export const $vocadb_album = sqliteTable('vocadb_album', {
	id: integer('id').$type<VocaDBAlbumId>().primaryKey(),
	album_id: integer('album_id').$type<AlbumId>(),

	vocadb_artist: text('vocadb_artist', { mode: 'json' }).$type<VocaDBArtistId>(),
	vocadb_tracks: text('vocadb_tracks', { mode: 'json' }).$type<AlbumTracks<VocaDBSongId>>(),
})

// WITHOUT-ROWID: vocadb_artist
export const $vocadb_artist = sqliteTable('vocadb_artist', {
	id: integer('id').$type<VocaDBArtistId>().primaryKey(),
	artist_id: integer('artist_id').$type<ArtistId>(),

	vocadb_base_voicebank: integer('vocadb_base_voicebank').$type<VocaDBArtistId>(),
})

// its safe to clear these out, it'll just cause a re-fetch
// there is no race conditions if you ran a cleanup pass at the end, you're at no risk
export const $retry_backoff = sqliteTable('retry_backoff', {
	issued: integer('issued').notNull(),
	expire: integer('expire'), // null for never

	ident: text('ident').$type<Ident>().notNull(),
	pass: integer('pass').$type<WyHash>().notNull(), // wyhash integer
}, (t) => ({
	unq: unique("retry_backoff.unq").on(t.ident, t.pass),
	pidx: index("retry_backoff.full_idx").on(t.expire, t.pass, t.ident),
}))

// persistent store
// WITHOUT-ROWID: kv_store
export const $kv_store = sqliteTable('kv_store', {
	kind: text('kind').primaryKey(),
	data: text('data', { mode: 'json' }).notNull(),
})

// hash can either be an FSHash or a URL gated behind a pass to defer downloading
// if it fails, no backoff just delete the entry
// check if starts with https:// or http:// (nanoid has no //)

// TODO: image perceptual hash to remove duplicates after download
//       can easily find one and have it stores inside the table

// WITHOUT-ROWID: images
export const $images = sqliteTable('images', {
	hash: text('hash').$type<FSRef>().primaryKey(),
	ident: text('ident').$type<Ident>().notNull(),
	kind: text('kind').$type<ImageKind>().notNull(),
	width: integer('width').notNull(),
	height: integer('height').notNull(),
}, (t) => ({
	pkidx: index("images.ident_idx").on(t.ident, t.hash),
}))

// `width` and `height` are optional, they are only present in video sources

// a source is a video/audio file, always containing some form of audio
// WITHOUT-ROWID: sources
export const $sources = sqliteTable('sources', {
	hash: text('hash').$type<FSRef>().primaryKey(),
	ident: text('ident').$type<Ident>().notNull(),
	track_id: integer('track_id').$type<TrackId>(),
	width: integer('width'),
	height: integer('height'),
	bitrate: integer('bitrate').notNull(), // in Hz, not kHz (bitrate, not sample rate)
	fingerprint: integer('fingerprint').$type<AudioFingerprintId>(),
}, (t) => ({
	//pidx0: index("sources.idx0").on(t.ident, t.fingerprint),
	pidx1: index("sources.idx1").on(t.fingerprint),
}))

// chromaprint is a 32-bit integer array, usually bounded by 120 seconds or less
// this doesn't represent the entire length of the audio
// one second is ~7.8 uint32s

// compression of a chromaprint is a BAD idea, the entropy is already way too high
// i tried, you'll save 100 bytes in 4000, not worth it

// rowid is beneficial here. forces integer type (no affinity) on the PK
// and because we're storing big data in here (>200 bytes on 4KiB page)
// https://www.sqlite.org/withoutrowid.html
export const $audio_fingerprint = sqliteTable('audio_fingerprint', {
	id: integer('id').$type<AudioFingerprintId>().primaryKey(),
	chromaprint: blob('chromaprint').$type<Uint8Array>().notNull(),
	duration_s: real('duration_s').notNull(), // not accurate to sources, but within 7 seconds
}, (t) => ({
	pidx: index("audio_fingerprint.idx").on(t.duration_s, t.chromaprint),
}))
