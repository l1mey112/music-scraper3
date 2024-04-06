import { sql } from "drizzle-orm"
import { db } from "../db"
import * as schema from '../schema'
import { api_ytmusic } from "../api_lazy"
import { run_with_concurrency_limit } from "../pass"
import { ProgressRef } from "../server"
import type YTMusic from "ytmusic-api"
import { Override } from "../types"

// sources.download.from_youtube_video
export async function pass_sources_download_from_youtube_video() {
	const k = db.select({ id: schema.youtube_video.id })
		.from(schema.youtube_video)
		.where(sql`('yv' || ${schema.youtube_video.id}) not in (select ${schema.sources.ident} from ${schema.sources})`)
		.all()

	// this shouldn't fail, its assumed that the youtube_video table doesn't contain invalid ids

	const pc = new ProgressRef('sources.download.from_youtube_video')

	const yt_music = await api_ytmusic()

	run_with_concurrency_limit(k, 1, pc, async ({ id }) => {
		const item: Song = await yt_music.getSong(id)

		// youtube provides high quality versions of the audio and video separately
		// stitch those together using ffmpeg
		// last resort is inside formats array, which is a mix of audio and video

		// formats (audio + video)
		// - "audioQuality": "AUDIO_QUALITY_LOW", "qualityLabel": "360p", "averageBitrate": 558040, "contentLength": "12951149", "audioSampleRate": "44100", "width": 640, "height": 360,

		// adaptiveFormats (video)
		// - "qualityLabel": "1080p", "averageBitrate": 1284957, "contentLength": "29811019", "width": 1920, "height": 1080,
		// - "qualityLabel": "720p", "averageBitrate": 495135, "contentLength": "11487134", "width": 1280, "height": 720,

		// adaptiveFormats (audio)
		// - "audioQuality": "AUDIO_QUALITY_MEDIUM", "averageBitrate": 129076, "contentLength": "2994923", "audioSampleRate": "48000",
		// - "audioQuality": "AUDIO_QUALITY_LOW", "averageBitrate": 64427, "contentLength": "1494880", "audioSampleRate": "48000",
		// - "audioQuality": "AUDIO_QUALITY_LOW", "averageBitrate": 48436, "contentLength": "1123849", "audioSampleRate": "48000",

		// relying on strings is a no go, we're interested in the highest quality available
		// get there by comparing numbers to numbers
		
		// most telling of quality is the averageBitrate for audio and video only formats (though use bitrate instead)

		// for audio + video formats, we lose the abiliy to reason about audio quality using bitrate
		// compare audioSampleRate and width and height to determine quality, then bitrate
		// videos with higher quality images usually have higher quality audio

		// just sort by bitrate for now, exhausting all adaptive formats is assumed to be quite rare

		let format: { video: AdaptiveFormatVideo, audio?: AdaptiveFormatAudio }

		exit: {
			if (item.adaptiveFormats.length > 0) {
				const audio: AdaptiveFormatAudio | undefined = item.adaptiveFormats
					.filter(f => f.mimeType.startsWith('audio/')) // should be narrowed down to AdaptiveFormatAudio[]
					.sort((a, b) => b.bitrate - a.bitrate)[0] as unknown as AdaptiveFormatAudio

				const video: AdaptiveFormatVideo | undefined = item.adaptiveFormats
					.filter(f => f.mimeType.startsWith('video/')) // should be narrowed down to AdaptiveFormatVideo[]
					.sort((a, b) => b.bitrate - a.bitrate)[0] as unknown as AdaptiveFormatVideo

				if (audio && video) {
					format = { audio, video }
					break exit
				}
			}

			if (item.formats.length > 0) {
				const video_plus_audio: Format | undefined = item.formats
					.sort((a, b) => b.bitrate - a.bitrate)[0]

				format = { video: video_plus_audio }
				break exit
			}
		
			// rare?
			throw new Error('no format found')
		}

		console.log(format) // duhh you need decryption for some videos
	})
}

type OriginalSong = Awaited<ReturnType<YTMusic['getSong']>>
type Song = Override<OriginalSong, {
	formats: Format[]
	adaptiveFormats: AdaptiveFormat[]
}>

type Format = AdaptiveFormatVideo & AdaptiveFormatAudio
type AdaptiveFormat = AdaptiveFormatVideo | AdaptiveFormatAudio

type AdaptiveFormatVideo = {
	itag: number
	url: string
	mimeType: `video/${string}`
	bitrate: number
	width: number
	height: number
	initRange: {
		start: string
		end: string
	}
	indexRange: {
		start: string
		end: string
	}
	lastModified: string
	contentLength: string
	quality: string
	fps: number
	qualityLabel: string
	projectionType: string
	averageBitrate: number
	approxDurationMs: string
	colorInfo?: {
		primaries: string
		transferCharacteristics: string
		matrixCoefficients: string
	}
	highReplication?: boolean
}

type AdaptiveFormatAudio = {
	itag: number
	url: string
	mimeType: `audio/${string}`
	bitrate: number
	initRange: {
		start: string
		end: string
	}
	indexRange: {
		start: string
		end: string
	}
	lastModified: string
	contentLength: string
	quality: string
	projectionType: string
	averageBitrate: number
	highReplication?: boolean
	audioQuality: string
	approxDurationMs: string
	audioSampleRate: string
	audioChannels: number
	loudnessDb: number
}