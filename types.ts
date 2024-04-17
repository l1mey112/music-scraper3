import { $locale, $links } from "./schema";

// misc
export type MaybePromise<T> = T | Promise<T>
export type Override<T1, T2> = Omit<T1, keyof T2> & T2;
export type NewType<K, T> = T & { readonly __newtype: K }
export type NullMit<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
export type KV<K, V> = Partial<Record<K, V>>

export type TrackId = NewType<'TrackId', number>
export type AlbumId = NewType<'AlbumId', number>
export type ArtistId = NewType<'ArtistId', number>

export type LinkId = NewType<'LinkId', number>

type PassField = 'all' | 'track' | 'album' | 'artist' | 'karent_album' | 'karent_artist' | 'youtube_video' | 'youtube_channel' | 'links' | 'images' | 'sources'
type PassKind = 'meta' | 'extrapolate' | 'download' | 'classify'
export type PassIdentifier = `${PassField}.${PassKind}.${string}`

export type Ident = NewType<'Ident', string>

export type KarentArtistId = NewType<'KarentArtistId', string>
export type KarentAlbumId = NewType<'KarentAlbumId', string>
export type SpotifyArtistId = NewType<'SpotifyArtistId', string>
export type SpotifyAlbumId = NewType<'SpotifyAlbumId', string>
export type SpotifyTrackId = NewType<'SpotifyTrackId', string>
export type VocaDBArtistId = NewType<'VocaDBArtistId', string>
export type VocaDBAlbumId = NewType<'VocaDBAlbumId', string>
export type VocaDBSongId = NewType<'VocaDBSongId', string>
export type YoutubeVideoId = NewType<'YoutubeVideoId', string>
export type YoutubeChannelId = NewType<'YoutubeChannelId', string>
export type AudioFingerprintId = NewType<'AudioFingerprintId', number>

export type ArtistList<T> = T[]
export type AlbumTracks<T> = { disc: number, i: number, id: T }[] // usually 1 indexed

const image_kind_tostring = {
	yt_thumbnail: 'YouTube Thumbnail',
	yt_banner: 'YouTube Banner',
	yt_tv_banner: 'YouTube TV Banner',
	yt_mobile_banner: 'YouTube Mobile Banner',
	cover_art: 'Cover Art',
	profile_art: 'Profile Art',
}

export type ImageKind = keyof typeof image_kind_tostring
export function imagekind_tostring(kind: ImageKind): string {
	return image_kind_tostring[kind]
}

export type FSRef = NewType<'FSHash', string>

// see locale.ts
// Locale is a IETF language subtag (e.g. en, jp)
// unknown locales are represented as `--`
export const LocaleNone = '--' as LocaleRef
export type LocaleRef = NewType<'Locale', '--' | string>

const link_kind_tostring = {
	yt_video_id: 'YouTube Video',
	yt_channel_id: 'YouTube Channel',
	yt_playlist_id: 'YouTube Playlist',
	sp_track_id: 'Spotify Track',
	sp_album_id: 'Spotify Album',
	sp_artist_id: 'Spotify Artist',
	ap_album_id: 'Apple Music Album',
	ka_album_id: 'Karent Album',
	ka_artist_id: 'Karent Artist',
	vd_song_id: 'VocaDB Song Entry',
	vd_album_id: 'VocaDB Album Entry',
	vd_artist_id: 'VocaDB Artist Entry',
	pi_item_id: 'Piapro Item',
	pi_creator: 'Piapro Creator',
	ni_video_id: 'Niconico Video',
	ni_user_id: 'Niconico User',
	ni_material_id: 'Niconico Material',
	tw_user: 'Twitter User',
	tc_linkcore: 'Linkcore', // tunecore JP
	lf_lnk_to: 'Linkfire (lnk.to)',
	lf_lnk_toc: 'Linkfire (lnk.to)', // composite `${string}/${string}`
	unknown: 'Unknown URL',
}

export type Link = typeof $links.$inferInsert
export type Locale = typeof $locale.$inferInsert

export type LinkKind = keyof typeof link_kind_tostring
export function linkkind_tostring(kind: LinkKind): string {
	return link_kind_tostring[kind]
}

/* export function linkkind_url(kind: LinkKind, data: string): string {
	switch (kind) {
		case 'yt_video_id':    return `https://www.youtube.com/watch?v=${data}`
		case 'yt_channel_id':  return `https://www.youtube.com/channel/${data}`
		case 'yt_playlist_id': return `https://www.youtube.com/playlist?list=${data}`
		case 'sp_track_id':    return `https://open.spotify.com/track/${data}`
		case 'sp_album_id':    return `https://open.spotify.com/album/${data}`
		case 'sp_artist_id':   return `https://open.spotify.com/artist/${data}`
		case 'ap_album_id':    return `https://music.apple.com/album/${data}`
		case 'ka_album_id':    return `https://karent.jp/album/${data}`
		case 'ka_artist_id':   return `https://karent.jp/artist/${data}`
		case 'vd_song_id':     throw null // TODO
		case 'vd_album_id':    throw null // TODO
		case 'vd_artist_id':   throw null // TODO
		case 'pi_item_id':     throw null // TODO
		case 'pi_creator':     throw null // TODO
		case 'ni_video_id':    throw null // TODO
		case 'ni_user_id':     throw null // TODO
		case 'ni_material_id': throw null // TODO
		case 'tw_user':        throw null // TODO
		case 'tc_linkcore':    throw null // TODO
		case 'lf_lnk_to':      throw null // TODO
		case 'lf_lnk_toc':     throw null // TODO
		case 'unknown':        throw null // TODO
	}
} */

export enum LocalePart {
	name,
	description,
}

export type WyHash = NewType<'WyHash', bigint> // 64 bit integer

export const HOURS = 1000 * 60 * 60
export const DAYS = HOURS * 24
