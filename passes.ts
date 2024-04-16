import { PassElement } from "./pass"

import { pass_youtube_channel_extrapolate_from_channel_id, pass_youtube_channel_meta_youtube_channel0, pass_youtube_channel_meta_youtube_channel1, pass_youtube_video_meta_youtube_video } from "./passes/youtube"
import { pass_all_extrapolate_from_links, pass_links_classify_link_shorteners, pass_links_classify_weak } from "./passes/links"
import { pass_images_download_url_to_hash } from "./passes/images"
import { pass_sources_download_from_youtube_video_ytdlp } from "./passes/youtube_download"
import { pass_sources_classify_audio_fingerprint } from "./passes/chromaprint"
import { pass_links_extrapolate_from_linkcore, pass_links_extrapolate_from_lnk_to } from "./passes/links_distributors"
import { pass_karent_album_meta_karent_album, pass_karent_artist_meta_karent_artist } from "./passes/karent"
import { pass_album_meta_vocadb, pass_artist_meta_vocadb, pass_track_meta_vocadb, pass_track_meta_vocadb_from_youtube } from "./passes/vocadb"
import { pass_album_meta_spotify, pass_artist_meta_spotify, pass_track_meta_spotify } from "./passes/spotify"
import { pass_sources_download_from_youtube_video_zotify } from "./passes/spotify_download"
import { pass_artist_meta_spotify_supplementary } from "./passes/spotify_raw"
import { pass_artist_classify_auto } from "./passes/classify_artist"
import { pass_track_classify_from_other_tracks, pass_track_classify_from_source_fingerprint } from "./passes/classify_track"

export const passes: PassElement[] = [
	[
		[
			[
				{ name: 'youtube_video.meta.youtube_video', fn: pass_youtube_video_meta_youtube_video },
				{ name: 'track.meta.vocadb_from_youtube', fn: pass_track_meta_vocadb_from_youtube },
				{ name: 'track.meta.vocadb', fn: pass_track_meta_vocadb },
				{ name: 'track.meta.spotify', fn: pass_track_meta_spotify },
			],
			{ name: 'karent_album.meta.karent_album', fn: pass_karent_album_meta_karent_album },
			{ name: 'album.meta.vocadb', fn: pass_album_meta_vocadb },
			{ name: 'album.meta.spotify', fn: pass_album_meta_spotify },
		],
		{ name: 'youtube_channel.extrapolate.from_channel_id', fn: pass_youtube_channel_extrapolate_from_channel_id },
		{ name: 'youtube_channel.meta.youtube_channel0', fn: pass_youtube_channel_meta_youtube_channel0 },
		{ name: 'youtube_channel.meta.youtube_channel1', fn: pass_youtube_channel_meta_youtube_channel1 },
		{ name: 'karent_artist.meta.karent_artist', fn: pass_karent_artist_meta_karent_artist },
		{ name: 'artist.meta.vocadb', fn: pass_artist_meta_vocadb },
		{ name: 'artist.meta.spotify', fn: pass_artist_meta_spotify },
		{ name: 'artist.meta.spotify_artist_supplementary', fn: pass_artist_meta_spotify_supplementary },
		[
			{ name: 'links.classify.link_shorteners', fn: pass_links_classify_link_shorteners },
			{ name: 'links.classify.weak', fn: pass_links_classify_weak },
			{ name: 'links.extrapolate.from_linkcore', fn: pass_links_extrapolate_from_linkcore },
			{ name: 'links.extrapolate.from_lnk_to', fn: pass_links_extrapolate_from_lnk_to },
			{ name: 'all.extrapolate.from_links', fn: pass_all_extrapolate_from_links },
		],
	],
	{ name: 'images.download.url_to_hash', fn: pass_images_download_url_to_hash },
	{ name: 'sources.download.from_spotify_track_zotify', fn: pass_sources_download_from_youtube_video_zotify },
	{ name: 'sources.download.from_youtube_video_ytdlp', fn: pass_sources_download_from_youtube_video_ytdlp },
	{ name: 'sources.classify.audio_fingerprint', fn: pass_sources_classify_audio_fingerprint },
	{ name: 'artist.classify.auto', fn: pass_artist_classify_auto },
	{ name: 'track.classify.from_source_fingerprint', fn: pass_track_classify_from_source_fingerprint },
	{ name: 'track.classify.from_other_tracks', fn: pass_track_classify_from_other_tracks },
]
