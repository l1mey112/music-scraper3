import { sql } from "drizzle-orm"
import { db, ident_pk } from "../db"
import { $youtube_video, $youtube_channel, $locale } from '../schema'
import { ProgressRef } from "../server"
import { db_images_append_url } from "./images"
import { Locale, Ident, ImageKind, Link, LocaleRef, LocaleNone, LocalePart, YoutubeChannelId } from "../types"
import { link_insert, links_from_text } from "./links"
import { assert, db_backoff, db_backoff_or_delete, db_backoff_sql, run_with_concurrency_limit } from "../util"
import { locale_from_bcp_47, locale_insert } from "../locale"
import { YoutubeImage, meta_youtube_channel_lemmnos, meta_youtube_channel_v3, meta_youtube_video_v3 } from "./youtube_api"

function largest_image(arr: Iterable<YoutubeImage>): YoutubeImage | undefined {
	let largest: YoutubeImage | undefined = undefined;

	for (const image of arr) {
		if (!largest || image.width * image.height > largest.width * largest.height) {
			largest = image;
		}
	}

	return largest;
}

// youtube_video.meta.youtube_video
export async function pass_youtube_video_meta_youtube_video() {
	const DIDENT = 'youtube_video.meta.youtube_video'

	const k = db.select({ id: $youtube_video.id })
		.from($youtube_video)
		.where(db_backoff_sql(DIDENT, $youtube_video, $youtube_video.id))
		.all()

	if (k.length == 0) {
		return
	}

	const pc = new ProgressRef(DIDENT)

	for (let offset = 0; offset < k.length; offset += 50) {
		pc.emit(offset / k.length * 100)

		const batch = k.slice(offset, offset + 50) // 50 is the maximum batch size
		const results = await meta_youtube_video_v3(batch.map(v => v.id))

		for (let i = 0; i < batch.length; i++) {
			const result = results[i]

			// failed, delete
			// TODO: properly log
			if (typeof result === 'string') {
				db_backoff_or_delete(DIDENT, $youtube_video, $youtube_video.id, result)
				continue
			}

			let has_loc_title = false
			let has_loc_description = false

			const ident = ident_pk($youtube_video, result.id)
			const locales: Locale[] = []

			// localizations are higher quality
			for (const [locale_string, local] of Object.entries(result.localizations ?? {})) {
				const locale = locale_from_bcp_47(locale_string)
				if (!locale) {
					continue
				}
				const title = local.title
				const description = local.description

				if (title) {
					locales.push({
						ident,
						locale,
						part: LocalePart.name,
						text: title,
					})
					has_loc_title = true
				}
				if (description) {
					locales.push({
						ident,
						locale,
						part: LocalePart.description,
						text: description,
					})
					has_loc_description = true
				}
			}

			{
				// this gets lower quality than localizations, insert last

				let default_video_locale = LocaleNone
				if (result.defaultLanguage) {
					const locale = locale_from_bcp_47(result.defaultLanguage)
					if (locale) {
						default_video_locale = locale
					}
				}

				const title = result.title // default video language
				const description = result.description // default video language
				if (!has_loc_title) {
					locales.push({
						ident,
						locale: default_video_locale,
						part: LocalePart.name,
						text: title,
					})
				}
				if (!has_loc_description) {
					locales.push({
						ident,
						locale: default_video_locale,
						part: LocalePart.description,
						text: description,
					})
				}
			}

			// youtube provides many different thumbnails, and we may choose a thumbnail that isn't actually the displayed thumbnail
			// though the largest one is probably the right one...
			const thumb = largest_image(Object.values(result.thumbnails))

			// extract all URLs from the description, doesn't matter what locale
			const urls = links_from_text(result.description)

			const links: Link[] = urls.map(url => ({
				ident,
				kind: 'unknown',
				data: url,
			}))

			db.transaction(db => {
				db_backoff(DIDENT, ident)

				if (thumb) {
					db_images_append_url(ident, 'yt_thumbnail', thumb.url, thumb.width, thumb.height)
				}

				db.update($youtube_video)
					.set({
						channel_id: result.channelId as YoutubeChannelId,
					})
					.where(sql`id = ${result.id}`)
					.run()

				locale_insert(locales)
				link_insert(links)
			})
		}
	}

	pc.close()

	return true
}

// youtube_channel.extrapolate.from_channel_id
export function pass_youtube_channel_extrapolate_from_channel_id() {
	let updated = false
	const k = db.selectDistinct({ channel_id: $youtube_video.channel_id })
		.from($youtube_video)
		.where(sql`${$youtube_video.channel_id} is not null
			and not exists (select 1 from ${$youtube_channel} where ${$youtube_channel.id} = ${$youtube_video.channel_id})`)
		.all()

	for (const { channel_id } of k) {
		db.insert($youtube_channel)
			.values({ id: channel_id! })
			.onConflictDoNothing()
			.run()	
	}

	return k.length > 0
}

// youtube_channel.meta.youtube_channel0
export async function pass_youtube_channel_meta_youtube_channel0() {
	const DIDENT = 'youtube_channel.meta.youtube_channel0'
	
	let updated = false
	const k = db.select({ id: $youtube_channel.id })
		.from($youtube_channel)
		.where(db_backoff_sql(DIDENT, $youtube_channel, $youtube_channel.id))
		.all()

	const pc = new ProgressRef(DIDENT)

	for (let offset = 0; offset < k.length; offset += 50) {
		pc.emit(offset / k.length * 100)

		const batch = k.slice(offset, offset + 50) // 50 is the maximum batch size
		const results = await meta_youtube_channel_lemmnos(batch.map(v => v.id))

		for (let i = 0; i < batch.length; i++) {
			const result = results[i]

			// failed, delete
			// TODO: properly log
			if (typeof result === 'string') {
				db_backoff_or_delete(DIDENT, $youtube_channel, $youtube_channel.id, result)
				continue
			}

			const ident = ident_pk($youtube_channel, batch[i].id)

			type ChannelKey = keyof typeof result.images

			const img_map: Record<ChannelKey, ImageKind> = {
				avatar: 'profile_art',
				banner: 'yt_banner',
				tvBanner: 'yt_tv_banner',
				mobileBanner: 'yt_mobile_banner',
			}

			db.transaction(db => {
				for (const [key, kind] of Object.entries(img_map)) {
					const images = result.images[key as ChannelKey]
					if (!images) {
						continue
					}
		
					const thumb = largest_image(images)
		
					if (thumb) {
						db_images_append_url(ident, kind, thumb.url, thumb.width, thumb.height)
					}
				}
	
				// youtube v3 for channels doesn't actually set the `defaultLanguage` field on the snippet
				// which is fucking stupid. we have no way of telling the exact locale of a translation
				// of either the title or the description. forcing a language locale with the `?hl=` parameter
				// doesn't even work either.

				if (result.about.description) {
					const description: Locale = {
						ident,
						locale: LocaleNone,
						part: LocalePart.description,
						text: result.about.description,
					}
	
					locale_insert(description)
				}

				// channel title/display name isn't present in lemmnos
				// requested in `youtube_channel.meta.youtube_channel1`

				db.update($youtube_channel)
					.set({
						handle: result.about.handle,
					})
					.where(sql`id = ${ident}`)
					.run()
				
				const links: Link[] = result.about.links.map(({ url }) => {
					return {
						ident,
						kind: 'unknown',
						data: url,
					}
				})

				link_insert(links)
				db_backoff(DIDENT, ident)
			})
			updated = true
		}
	}

	pc.close()

	return updated
}

// youtube_channel.meta.youtube_channel1
export async function pass_youtube_channel_meta_youtube_channel1() {
	const DIDENT = 'youtube_channel.meta.youtube_channel1'
	
	let updated = false
	const k = db.select({ id: $youtube_channel.id })
		.from($youtube_channel)
		.where(db_backoff_sql(DIDENT, $youtube_channel, $youtube_channel.id))
		.all()

	const pc = new ProgressRef(DIDENT)

	for (let offset = 0; offset < k.length; offset += 50) {
		pc.emit(offset / k.length * 100)

		const batch = k.slice(offset, offset + 50) // 50 is the maximum batch size
		const results = await meta_youtube_channel_v3(batch.map(v => v.id))

		for (let i = 0; i < batch.length; i++) {
			const result = results[i]

			// failed, delete
			// TODO: properly log
			if (typeof result === 'string') {
				db_backoff_or_delete(DIDENT, $youtube_channel, $youtube_channel.id, result)
				continue
			}

			const ident = ident_pk($youtube_channel, batch[i].id)

			// this is ran after, and will take precedence over the last pass

			// even though we have no way of telling the locale of localized
			// (because youtube doesn't fucking tell us??)
			// its still higher quality as this is what people will see

			db.transaction(db => {
				if (result.description) {
					const description: Locale = {
						ident,
						locale: LocaleNone,
						part: LocalePart.description,
						text: result.localized.description,
					}
	
					locale_insert(description)
				}
	
				const display_name: Locale = {
					ident,
					locale: LocaleNone,
					part: LocalePart.name,
					text: result.localized.title,
				}
	
				locale_insert(display_name)
				db_backoff(DIDENT, ident)
			})
			updated = true
		}
	}

	pc.close()

	return updated
}

// https://stackoverflow.com/questions/18953499/youtube-api-to-fetch-all-videos-on-a-channel

// to extract uploads, take youtube ID and change UC to UU
//
//       reol channel id: UCB6pJFaFByws3dQj4AdLdyA
//                        ^^
// reol uploads playlist: UUB6pJFaFByws3dQj4AdLdyA
//                        ^^
//
// https://www.youtube.com/playlist?list=UUB6pJFaFByws3dQj4AdLdyA
//                                       ^^^^^^^^^^^^^^^^^^^^^^^^

// https://yt4.lemnoslife.com/noKey/playlistItems
//     ?part=contentDetails
//     &playlistId=UUB6pJFaFByws3dQj4AdLdyA
//     &maxResults=50

// https://developers.google.com/youtube/v3/docs/playlistItems/list
// returns next page token, then go ?pageToken=...
