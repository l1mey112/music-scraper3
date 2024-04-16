// initial data stores basically everything we need, but the gallery images at the bottom where the biography is
// it would be nice to have them, but it's not a priority

import { sql } from "drizzle-orm"
import { locale_current, locale_insert } from "../locale"
import { $spotify_artist } from "../schema"
import { db, ident_pk } from "../db"
import { db_backoff_or_delete, db_backoff_sql, run_with_concurrency_limit } from "../util"
import { ProgressRef } from "../server"
import { link_insert, links_from_text } from "./links"
import { Locale, LocalePart } from "../types"

async function spotify_raw_artist(spotify_id: string): Promise<SpotifyArtistInitialData | undefined> {	
	const url = `https://open.spotify.com/artist/${spotify_id}`
	const response = await fetch(url, {
		headers: {
			'Accept-Language': `${locale_current()}`,
		},
	})
	const text = await response.text()
	const match = text.match(/<script\s+id="initial-state"\s+type="text\/plain">([^<]+)<\/script>/)
	if (!match) {
		return undefined
	}

	const data: RawArtistInitialData = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'))
	const qn = `spotify:artist:${spotify_id}`

	let ret: SpotifyArtistInitialData
	try {
		ret = {
			followers: data.entities.items[qn].stats.followers,
			monthly_listeners: data.entities.items[qn].stats.monthlyListeners,
			avatar_extracted_colour_dark: data.entities.items[qn].visuals.avatarImage.extractedColors.colorDark?.hex,
			avatar_extracted_colour_raw: data.entities.items[qn].visuals.avatarImage.extractedColors.colorRaw?.hex,
			external_links: data.entities.items[qn].profile.externalLinks.items.map(v => v.url),
			biography: data.entities.items[qn].profile.biography.text,
		}
	} catch {
		return undefined
	}

	return ret
}

async function spotify_raw_track(spotify_id: string): Promise<SpotifyTrackInitialData | undefined> {
	const url = `https://open.spotify.com/track/${spotify_id}`
	const response = await fetch(url, {
		headers: {
			'Accept-Language': `${locale_current()}`,
		},
	})
	const text = await response.text()
	const match = text.match(/<script\s+id="initial-state"\s+type="text\/plain">([^<]+)<\/script>/)
	if (!match) {
		return undefined
	}

	const data: RawTrackInitialData = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'))
	const qn = `spotify:track:${spotify_id}`

	let ret: SpotifyTrackInitialData
	try {
		ret = {
			copyright: data.entities.items[qn].albumOfTrack.copyright.items,
		}
	} catch {
		return undefined
	}

	return ret
}

async function spotify_raw_album(spotify_id: string): Promise<SpotifyAlbumInitialData | undefined> {
	const url = `https://open.spotify.com/album/${spotify_id}`
	const response = await fetch(url, {
		headers: {
			'Accept-Language': `${locale_current()}`,
		},
	})
	const text = await response.text()
	const match = text.match(/<script\s+id="initial-state"\s+type="text\/plain">([^<]+)<\/script>/)
	if (!match) {
		return undefined
	}

	const data: RawAlbumInitialData = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'))
	const qn = `spotify:album:${spotify_id}`

	let ret: SpotifyAlbumInitialData
	try {
		ret = {
			cover_extracted_colour_dark: data.entities.items[qn].coverArt.extractedColors.colorDark?.hex,
			cover_extracted_colour_raw: data.entities.items[qn].coverArt.extractedColors.colorRaw?.hex,
		}
	} catch {
		return undefined
	}

	return ret
}

// artist.meta.spotify_artist_supplementary
export async function pass_artist_meta_spotify_supplementary() {
	const DIDENT = 'artist.meta.spotify_artist_supplementary'

	// same backoff bloat avoidance as in `spotify.ts`

	let updated = false
	const k = db.select({ id: $spotify_artist.id })
		.from($spotify_artist)
		.where(sql`spotify_followers is null or spotify_monthly_listeners is null
			and ${db_backoff_sql(DIDENT, $spotify_artist, $spotify_artist.id)}`)
		.all()

	if (k.length === 0) {
		return
	}

	// append links
	// append biography
	// set data

	const sp = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 20, sp, async (artist) => {
		const data = await spotify_raw_artist(artist.id)

		if (!data) {
			db_backoff_or_delete(DIDENT, $spotify_artist, $spotify_artist.id, artist.id)
			return
		}

		const ident = ident_pk($spotify_artist, artist.id)

		db.transaction(db => {
			const links: string[] = [...data.external_links]

			if (data.biography) {
				links.push(...links_from_text(data.biography))

				const biography: Locale = {
					ident,
					locale: locale_current(),
					part: LocalePart.description,
					text: data.biography,
				}

				locale_insert(biography)
			}

			link_insert(links.map(it => ({ ident, kind: 'unknown', data: it })))

			db.update($spotify_artist)
				.set({
					spotify_followers: data.followers,
					spotify_monthly_listeners: data.monthly_listeners,
					spotify_avatar_extracted_colour_dark: data.avatar_extracted_colour_dark,
					spotify_avatar_extracted_colour_raw: data.avatar_extracted_colour_raw,
				})
				.where(sql`id = ${artist.id}`)
				.run()
		})
		updated = true
	})

	sp.close()

	return updated
}

export type SpotifyImage = {
	height: number
	url: string
	width: number
}

export type SpotifyCopyright = {
	text: string
	type: string
}

export type SpotifyArtistInitialData = {
	followers: number
	monthly_listeners: number
	avatar_extracted_colour_dark?: string // hex
	avatar_extracted_colour_raw?: string // hex
	external_links: string[]
	biography: string | null
}

interface RawArtistInitialData {
	entities: {
		items: {
			[key: string]: {
				profile: {
					biography: {
						text: string
					}
					externalLinks: {
						items: {
							// name: string
							url: string
						}[]
					}
					// name: string
				}
				stats: {
					followers: number
					monthlyListeners: number
				}
				visuals: {
					avatarImage: {
						extractedColors: {
							colorDark?: {
								hex: string
							}
							colorRaw?: {
								hex: string
							}
						}
						sources: SpotifyImage[]
					}
					headerImage: {
						sources: SpotifyImage[]
					}
				}
			}
		}
	}
}

export type SpotifyTrackInitialData = {
	copyright: SpotifyCopyright[]
}

interface RawTrackInitialData {
	entities: {
		items: {
			[key: string]: {
				albumOfTrack: {
					copyright: {
						items: SpotifyCopyright[]
					}
				}
			}
		}
	}
}

export type SpotifyAlbumInitialData = {
	cover_extracted_colour_dark?: string // hex
	cover_extracted_colour_raw?: string // hex
}

interface RawAlbumInitialData {
	entities: {
		items: {
			[key: string]: {
				coverArt: {
					extractedColors: {
						colorDark?: {
							hex: string
						}
						colorRaw?: {
							hex: string
						}
					}
				}
			}
		}
	}
}
