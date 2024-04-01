import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { YoutubeChannel, YoutubeChannelId, YoutubeVideo, YoutubeVideoId } from "./types";

// WITHOUT-ROWID: youtube_video
export const youtube_video = sqliteTable('youtube_video', {
	id: text('id').$type<YoutubeVideoId>().primaryKey(), // youtube_id

	meta_youtube_video: text('meta_youtube_video', { mode: "json" }).$type<YoutubeVideo>(),
})

// WITHOUT-ROWID: youtube_channel
export const youtube_channel = sqliteTable('youtube_channel', {
	id: text('id').$type<YoutubeChannelId>().primaryKey(), // youtube_id

	meta_youtube_channel: text('meta_youtube_channel', { mode: "json" }).$type<YoutubeChannel>(),
})

// pass backoff for metadata
// WITHOUT-ROWID: pass_backoff
export const pass_backoff = sqliteTable('pass_backoff', {
	utc: integer('utc').primaryKey(),

	ident: text('ident').notNull(),  // "b" + id
	pass: integer('pass').notNull(), // wyhash integer
})

// persistent store
// WITHOUT-ROWID: thirdparty:store
export const thirdparty_store = sqliteTable('thirdparty:store', {
	kind: text('kind').primaryKey(),
	data: text('data', { mode: 'json' }).notNull(),
})
