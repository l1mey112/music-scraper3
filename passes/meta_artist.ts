import { sql } from "drizzle-orm";
import { db, ident_pk } from "../db";
import { $artist, $images, $locale, $spotify_artist, $vocadb_artist, $youtube_channel } from "../schema";
import { ArtistId, FSRef, Ident, ImageKind, LocalePart, LocaleRef } from "../types";
import { locale_current, locale_script_equal } from "../locale";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { extract_idents } from "./meta_track";

// will iterate in order, leaving the last Idents to take precedence and remain
// which means you should probably generate your Idents in reverse
export function pick_best_locale_name(locale_idents: Ident[]): string | undefined {
	const preferred_locale = locale_current()

	type ChosenLocale = {
		locale: LocaleRef,
		text: string,
	}

	let chosen_locale: ChosenLocale | undefined

	for (const ident of locale_idents) {
		const names = db.select({ locale: $locale.locale, text: $locale.text })
			.from($locale)
			.where(sql`ident = ${ident} and part = ${LocalePart.name}`)
			.all()

		for (const name of names) {
			if (!chosen_locale) {
				chosen_locale = name
				continue
			}

			if (locale_script_equal(preferred_locale, name.locale)) {
				chosen_locale = name
				break
			}
		}
	}

	if (!chosen_locale) {
		return
	}

	return chosen_locale.text
}

export function pick_best_image_kind(image_idents: Ident[], kind: ImageKind): FSRef | undefined {
	type ChosenProfileImage = {
		hash: FSRef,
		width: number,
		height: number,
	}

	let chosen_profile_image: ChosenProfileImage | undefined

	for (const ident of image_idents) {
		const images = db.select({ hash: $images.hash, width: $images.width, height: $images.height })
			.from($images)
			.where(sql`ident = ${ident} and kind = ${kind}`)
			.all()

		for (const image of images) {
			if (!chosen_profile_image) {
				chosen_profile_image = image
				continue
			}

			if (image.width * image.height > chosen_profile_image.width * chosen_profile_image.height) {
				chosen_profile_image = image
				break
			}
		}
	}

	if (!chosen_profile_image) {
		return
	}

	return chosen_profile_image.hash
}

// artist.meta.assign
export function pass_artist_meta_assign() {
	let updated = false
	const k = db.select({ id: $artist.id })
		.from($artist)
		.where(sql`name is null`)
		.all()

	const preferred_locale = locale_current()

	function classify(artist_id: ArtistId) {

		// find best name by selecting close to default locale

		type ChosenLocale = {
			locale: LocaleRef,
			text: string,
		}

		let chosen_locale: ChosenLocale | undefined

		// reverse so worse locales (lower quality sources) are overwritten nearing the end
		const locale_idents = extract_idents(artist_id, 'artist_id', [
			$youtube_channel,
			$spotify_artist,
			$vocadb_artist,
		])

		for (const ident of locale_idents) {
			const names = db.select({ locale: $locale.locale, text: $locale.text })
				.from($locale)
				.where(sql`ident = ${ident} and part = ${LocalePart.name}`)
				.all()

			for (const name of names) {
				if (!chosen_locale) {
					chosen_locale = name
					continue
				}

				if (locale_script_equal(preferred_locale, name.locale)) {
					chosen_locale = name
					break
				}
			}
		}

		if (!chosen_locale) {
			return
		}

		const image_idents = extract_idents(artist_id, 'artist_id', [
			$vocadb_artist,
			$spotify_artist,
			$youtube_channel,
		])

		const profile_hash = pick_best_image_kind(image_idents, 'profile_art')

		db.update($artist)
			.set({ name: chosen_locale.text, profile_image: profile_hash })
			.where(sql`id = ${artist_id}`)
			.run()
		
		updated = true
	}

	for (const { id } of k) {
		classify(id)
	}

	return updated
}
