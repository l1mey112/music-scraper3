// misc
export type MaybePromise<T> = T | Promise<T>
export type Override<T1, T2> = Omit<T1, keyof T2> & T2;

export type PIdent = string // permanent identifier

export type YoutubeVideoId = string
export type YoutubeChannelId = string

export type ImageKind = 'yt_thumbnail' | 'yt_avatar' | 'yt_banner' | 'yt_tv_banner' | 'yt_mobile_banner' // | ...

export type LiteralHash = bigint & { readonly __tag: unique symbol }
export type FSHash = string & { readonly __tag: unique symbol }

type PassField = 'all' | 'track' | 'album' | 'artist' | 'youtube_video' | 'youtube_channel' | 'links' | 'images' | 'sources'
type PassKind = 'meta' | 'extrapolate' | 'download' | 'classify'
export type PassIdentifier = `${PassField}.${PassKind}.${string}`
