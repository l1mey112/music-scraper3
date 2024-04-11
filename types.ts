import * as schema from './schema'


// misc
export type MaybePromise<T> = T | Promise<T>
export type Override<T1, T2> = Omit<T1, keyof T2> & T2;
export type NewType<T> = T & { readonly __newtype: unique symbol }

export type UniFK = NewType<string> // permanent identifier

export type KarentAlbumId = string
export type SpotifyArtistId = string
export type SpotifyAlbumId = string
export type SpotifyTrackId = string
export type YoutubeVideoId = string
export type YoutubeChannelId = string

export type TrackId = NewType<number>
export type AudioFingerprintId = NewType<number>

export type ImageKind = 'yt_thumbnail' | 'yt_avatar' | 'yt_banner' | 'yt_tv_banner' | 'yt_mobile_banner' // | ...

export type LiteralHash = NewType<bigint>
export type FSHash = NewType<string>

type PassField = 'all' | 'track' | 'album' | 'artist' | 'karent_album' | 'karent_artist' | 'youtube_video' | 'youtube_channel' | 'links' | 'images' | 'sources'
type PassKind = 'meta' | 'extrapolate' | 'download' | 'classify'
export type PassIdentifier = `${PassField}.${PassKind}.${string}`

export type Link = typeof schema.links.$inferInsert
