import { sql } from "drizzle-orm"
import { db, ident_pk } from "../db"
import { locale_insert } from "../locale"
import { $vocadb_album, $vocadb_artist, $vocadb_song, $youtube_video } from "../schema"
import { ProgressRef } from "../server"
import { AlbumTracks, ArtistList, Locale, Ident, Link, LocaleRef, LocaleNone, LocalePart, VocaDBAlbumId, VocaDBArtistId, VocaDBSongId } from "../types"
import { db_backoff, db_backoff_exactly, db_backoff_forever, db_backoff_or_delete, db_backoff_sql, run_with_concurrency_limit } from "../util"
import { link_insert } from "./links"
import { db_images_append_url_without_dimensions } from "./images"

function append_artist_ids(artists: ArtistList<VocaDBArtistId>) {
	if (artists.length > 0) {
		db.insert($vocadb_artist)
			.values(artists.map(id => ({ id })))
			.onConflictDoNothing()
			.run()
	}
}

function append_album_ids(albums: { id: VocaDBAlbumId }[]) {
	if (albums.length > 0) {
		db.insert($vocadb_album)
			.values(albums)
			.onConflictDoNothing()
			.run()
	}
}

function append_song_ids(ids: { id: VocaDBSongId }[]) {
	if (ids.length > 0) {
		db.insert($vocadb_song)
			.values(ids)
			.onConflictDoNothing()
			.run()
	}
}

function extract_locales(ident: Ident, entries: VocaDBNameEntry[], out: Locale[]) {
	for (const name of entries) {
		let locale = nameentry_mapping[name.language]

		if (!locale) {
			console.log('vocadb: unknown locale (proceeding)', name.language)
			locale = LocaleNone
		}

		out.push({
			ident,
			locale,
			part: LocalePart.name,
			text: name.value,
		})
	}
}

// return true if the release date is past
// otherwise return time until release in millis
function released_date(release: VocaDBReleaseDate): true | number {
	const now = new Date();

	if (release.year === undefined) {
		return true // technically false, but we can safely assume that its released
	}

	const releaseDate = new Date(
		release.year,
		release.month ? release.month - 1 : 0, // months are 0-indexed
		release.day ? release.day : 1
	)

	if (releaseDate.getTime() <= now.getTime()) {
		return true
	}

	return releaseDate.getTime() - now.getTime()
}

// track.meta.vocadb_from_youtube
export async function pass_track_meta_vocadb_from_youtube() {
	const DIDENT = 'track.meta.vocadb_from_youtube'

	let updated = false
	const k = db.select({ id: $youtube_video.id })
		.from($youtube_video)
		.where(db_backoff_sql(DIDENT, $youtube_video, $youtube_video.id))
		.all()

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 4, pc, async ({ id }) => {
		const ident = ('yv/' + id) as Ident

		const resp = await fetch(`https://vocadb.net/api/songs/byPv?pvService=Youtube&pvId=${id}`, {
			headers: {
				"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			}
		})

		const json = await resp.json() as ByPV | null

		db.transaction(db => {
			db_backoff(DIDENT, ident)

			if (!json) {
				return
			}

			db.insert($vocadb_song)
				.values({ id: json.id })
				.onConflictDoNothing()
				.run()

			updated = true
		})
	})

	pc.close()

	return updated
}

type ByPV = {
	artistString: string
	createDate: string
	defaultName: string
	defaultNameLanguage: string
	favoritedTimes: number
	id: VocaDBSongId
	lengthSeconds: number
	name: string
	publishDate: string
	pvServices: string
	ratingScore: number
	songType: string
	status: string
	version: number
}

// track.meta.vocadb
export async function pass_track_meta_vocadb() {
	const DIDENT = 'track.meta.vocadb'

	let updated = false
	const k = db.select({ id: $vocadb_song.id })
		.from($vocadb_song)
		.where(db_backoff_sql(DIDENT, $vocadb_song, $vocadb_song.id))
		.all()

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 4, pc, async ({ id }) => {
		const ident = ident_pk($vocadb_song, id)

		const resp = await fetch(`https://vocadb.net/api/songs/${id}?fields=Names,Albums,Artists,WebLinks,PVs`, {
			headers: {
				"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			}
		})

		if (!resp.ok) {
			db_backoff_or_delete(DIDENT, $vocadb_song, $vocadb_song.id, id)
			return
		}

		const json = await resp.json() as VocaDBSong

		db.transaction(db => {
			// later
			if (json.status != 'Finished' && json.status != 'Locked') {
				db_backoff(DIDENT, ident)
			} else {
				db_backoff_forever(DIDENT, ident)
			}

			// append albums
			// append artists
			// append names
			// append links

			// we want the artists who took part in singing or producing the song
			// not the animators or illustrators

			const known_not_wanted_roles = [
				'Animator',
				'Illustrator',
				'Instrumentalist',
			]

			const wanted_roles = [
				'Vocalist',
				'Producer',
				'Composer',
				'Default',
				'Arranger',
				'Mastering',
				'Lyricist',
				'VoiceManipulator',
				'Publisher',
			]

			const artists: ArtistList<VocaDBArtistId> = []

			for (const artist of json.artists) {				
				// if only they had better documentation...
				// https://github.com/VocaDB/vocadb/blob/af2e4adb2b96b18ddbcca74116b2cbdb4bd44f95/VocaDbWeb/Scripts/Models/Artists/ArtistCategories.ts#L2
				// https://github.com/VocaDB/vocadb/blob/af2e4adb2b96b18ddbcca74116b2cbdb4bd44f95/VocaDbWeb/Scripts/DataContracts/Song/SongDetailsForApi.ts#L156

				const roles = artist.roles.split(',').map(it => it.trim())
				const effective_roles = artist.effectiveRoles.split(',').map(it => it.trim())
				const union = new Set([...roles, ...effective_roles])

				if (!wanted_roles.some(it => union.has(it))) {
					if (!known_not_wanted_roles.some(it => union.has(it))) {
						console.log(`vocadb: ${id} unknown artist role (exiting)`, artist.effectiveRoles, artist.effectiveRoles)
					}
					continue
				}

				// ignore missing artists
				if (!artist.artist) {
					//console.log('vocadb: artist missing (proceeding)', artist)
					continue
				}

				const artist_id = artist.artist.id
				artists.push(artist_id)
			}

			const albums = []

			for (const album of json.albums) {
				// appending albums regardless for kind can cause an explosion in the DB
				// we don't want huge compilation DVD videos other works to be added

				if (album.discType == 'Video' || album.discType == 'Other') {
					continue
				}

				const known_disc_types = [
					'Video',
					'Compilation',
					'Single',
					'Album',
					'Other',
					'EP',
					'SplitAlbum',
				]

				if (!known_disc_types.includes(album.discType)) {
					console.log(`vocadb: unknown disc type (song id: ${id}) (proceeding)`, album.discType)
				}

				albums.push(album.id)
			}

			const locales: Locale[] = []
			extract_locales(ident, json.names, locales)

			const links: Link[] = []

			for (const link of json.webLinks) {
				links.push({
					ident,
					kind: 'unknown',
					data: link.url,
				})
			}

			for (const pv of json.pvs) {
				links.push({
					ident,
					kind: 'unknown',
					data: pv.url,
				})
			}

			db.update($vocadb_song)
				.set({
					vocadb_artists: artists,
					vocadb_albums: albums,
				})
				.where(sql`${$vocadb_song.id} = ${id}`)
				.run()

			append_artist_ids(artists)

			// TODO: ignoring albums for now...
			//       you need to add them manually

			// append_album_ids(albums)

			locale_insert(locales)
			link_insert(links)

			updated = true
		})

	})

	pc.close()

	return updated
}

// album.meta.vocadb
export async function pass_album_meta_vocadb() {
	const DIDENT = 'album.meta.vocadb'

	let updated = false
	const k = db.select({ id: $vocadb_album.id })
		.from($vocadb_album)
		.where(db_backoff_sql(DIDENT, $vocadb_album, $vocadb_album.id))
		.all()

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 10, pc, async ({ id }) => {
		const ident = ident_pk($vocadb_album, id)

		const resp = await fetch(`https://vocadb.net/api/albums/${id}?fields=WebLinks,Names,MainPicture,Discs,Tracks,Description,Artists`, {
			headers: {
				"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			}
		})

		if (!resp.ok) {
			db_backoff_or_delete(DIDENT, $vocadb_album, $vocadb_album.id, id)
			return
		}

		const json = await resp.json() as VocaDBAlbum

		db.transaction(db => {
			if (json.status != 'Finished' && json.status != 'Locked') {
				db_backoff(DIDENT, ident)
			} else {
				db_backoff_forever(DIDENT, ident)
			}

			// ensure release date
			// acknowledge useable disc types (audio only)
			// append tracks
			// append names
			// append description (unknown locale)
			// append links
			// append picture/album art
			// append artist

			const release = released_date(json.releaseDate)

			if (release !== true) {
				db_backoff_exactly(DIDENT, ident, release)
				return
			}

			const audio_discs = new Set<number>()

			for (const disc of json.discs) {
				if (disc.mediaType == 'Audio') {
					audio_discs.add(disc.discNumber)
				}
			}

			if (audio_discs.size == 0) {
				audio_discs.add(1)
			}

			const tracks: AlbumTracks<VocaDBSongId> = []

			for (const track of json.tracks) {
				if (!audio_discs.has(track.discNumber)) {
					continue
				}

				if (!track.song) {
					console.log('vocadb: track missing song (proceeding)', track)
					continue
				}

				tracks.push({
					disc: track.discNumber,
					i: track.trackNumber,
					id: track.song.id,
				})
			}

			const locales: Locale[] = []

			if (json.description) {
				locales.push({
					ident,
					locale: LocaleNone,
					part: LocalePart.description,
					text: json.description,
				})
			}

			extract_locales(ident, json.names, locales)

			const links: Link[] = []

			for (const link of json.webLinks) {
				links.push({
					ident,
					kind: 'unknown',
					data: link.url,
				})
			}

			const artist0 = json.artists[0]
			const artist0_id = artist0.artist?.id
			
			db.update($vocadb_album)
				.set({
					vocadb_tracks: tracks,
					vocadb_artist: artist0_id,
				})
				.where(sql`${$vocadb_album.id} = ${id}`)
				.run()

			if (artist0_id) {
				append_artist_ids([artist0_id])
			}
			append_song_ids(tracks)

			locale_insert(locales)
			link_insert(links)

			if (json.mainPicture?.urlOriginal) {
				db_images_append_url_without_dimensions(ident, 'cover_art', json.mainPicture.urlOriginal)
			}

			updated = true
		})
	})

	pc.close()

	return updated
}

// artist.meta.vocadb
export async function pass_artist_meta_vocadb() {
	const DIDENT = 'artist.meta.vocadb'

	let updated = false
	const k = db.select({ id: $vocadb_artist.id })
		.from($vocadb_artist)
		.where(db_backoff_sql(DIDENT, $vocadb_artist, $vocadb_artist.id))
		.all()

	const pc = new ProgressRef(DIDENT)

	await run_with_concurrency_limit(k, 4, pc, async ({ id }) => {
		const ident = ident_pk($vocadb_artist, id)

		const resp = await fetch(`https://vocadb.net/api/artists/${id}?fields=Names,Description,MainPicture,BaseVoicebank,WebLinks`, {
			headers: {
				"User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36",
			}
		})

		if (!resp.ok) {
			db_backoff_or_delete(DIDENT, $vocadb_artist, $vocadb_artist.id, id)
			return
		}

		const json = await resp.json() as VocaDBArtist

		db.transaction(db => {
			if (json.status != 'Finished' && json.status != 'Locked') {
				db_backoff(DIDENT, ident)
			} else {
				db_backoff_forever(DIDENT, ident)
			}

			// append names
			// append description (unknown locale)
			// append links
			// append picture/artist art
			// set base voicebank (if applicable)

			const locales: Locale[] = []

			if (json.description) {
				locales.push({
					ident,
					locale: LocaleNone,
					part: LocalePart.description,
					text: json.description,
				})
			}

			extract_locales(ident, json.names, locales)

			const links: Link[] = []

			for (const link of json.webLinks) {
				links.push({
					ident,
					kind: 'unknown',
					data: link.url,
				})
			}

			const base_voicebank = json.baseVoicebank?.id

			if (base_voicebank) {
				db.update($vocadb_artist)
					.set({
						vocadb_base_voicebank: base_voicebank,
					})
					.where(sql`${$vocadb_artist.id} = ${id}`)
					.run()
			}
			
			locale_insert(locales)
			link_insert(links)

			if (json.mainPicture?.urlOriginal) {
				db_images_append_url_without_dimensions(ident, 'profile_art', json.mainPicture.urlOriginal)
			}

			updated = true
		})
	})

	pc.close()

	return updated
}

// log for errors if they don't match
// i don't know the exact range of languages present on the site
// im probably missing chinese and a ton of other languages
const nameentry_mapping = {
	'Japanese':    'ja'      as LocaleRef,
	'Romaji':      'ja-latn' as LocaleRef,
	'English':     'en'      as LocaleRef,
	'Unspecified': '--'      as LocaleRef,
}

type VocaDBNameEntry = {
	language: keyof typeof nameentry_mapping
	value: string
}

// made nullable in anticipation, i actually don't know if it can be null
type VocaDBReleaseDate = {
	day?: number
	isEmpty: boolean
	month?: number
	year?: number
}

type VocaDBSongAlbum = {
	additionalNames: string
	artistString: string
	coverPictureMime: string
	createDate: string
	deleted: boolean
	discType: string
	id: VocaDBAlbumId
	name: string
	ratingAverage: number
	ratingCount: number
	releaseDate: VocaDBReleaseDate
	status: string
	version: number
	releaseEvent?: {
		category: string
		date: string
		endDate?: string
		id: number
		name: string
		seriesId: number
		seriesNumber: number
		seriesSuffix: string
		status: string
		urlSlug: string
		venueName: string
		version: number
	}
}

type VocaDBSongArtist = {
	artist?: {
		additionalNames: string
		artistType: string
		deleted: boolean
		id: VocaDBArtistId
		name: string
		pictureMime: string
		releaseDate?: string
		status: string
		version: number
	}
	categories: string
	effectiveRoles: string
	isSupport: boolean
	name: string
	roles: string
}

type VocaDBSongPV = {
	author: string
	disabled: boolean
	id: number
	length: number
	name: string
	publishDate: string
	pvId: string
	service: string
	pvType: string
	thumbUrl: string
	url: string
	extendedMetadata?: {
		json: string
	}
}

type VocaDBWebLink = {
	category: string
	description: string
	disabled: boolean
	id: number
	url: string
}

type VocaDBAlbumTrack = {
	discNumber: number
	id: number
	name: string
	song?: {
		artistString: string
		createDate: string
		defaultName: string
		defaultNameLanguage: string
		favoritedTimes: number
		id: VocaDBSongId
		lengthSeconds: number
		name: string
		publishDate: string
		pvServices: string
		ratingScore: number
		songType: string
		status: string
		version: number
		cultureCodes: Array<string>
		originalVersionId?: number
	}
	trackNumber: number
	computedCultureCodes: Array<string>
}

type VocaDBSong = {
	albums: VocaDBSongAlbum[]
	artists: VocaDBSongArtist[]
	artistString: string
	createDate: string
	defaultName: string
	defaultNameLanguage: string
	favoritedTimes: number
	id: VocaDBSongId
	lengthSeconds: number
	name: string
	names: VocaDBNameEntry[]
	publishDate: string
	pvs: VocaDBSongPV[]
	pvServices: string
	ratingScore: number
	songType: string
	status: string
	version: number
	webLinks: VocaDBWebLink[]
}

// we only want Audio discs
type VocaDBAlbumDisc = {
	discNumber: number
	id: number
	mediaType: string
	name: string // Audio | Video
}

type VocaDBAlbum = {
	artists: VocaDBSongArtist[]
	artistString: string
	catalogNumber: string
	createDate: string
	defaultName: string
	defaultNameLanguage: string
	description: string
	discs: VocaDBAlbumDisc[]
	discType: string
	id: number
	mainPicture?: {
		mime: string
		urlOriginal: string
		urlSmallThumb: string
		urlThumb: string
		urlTinyThumb: string
	}
	name: string
	names: VocaDBNameEntry[]
	ratingAverage: number
	ratingCount: number
	releaseDate: {
		day: number
		isEmpty: boolean
		month: number
		year: number
	}
	status: string
	tracks: VocaDBAlbumTrack[]
	version: number
	webLinks: VocaDBWebLink[]
}

type VocaDBArtist = {
	artistType: string
	baseVoicebank?: {
		additionalNames: string
		artistType: string
		deleted: boolean
		id: VocaDBArtistId
		name: string
		pictureMime: string
		releaseDate: string
		status: string
		version: number
	}
	createDate: string
	defaultName: string
	defaultNameLanguage: string
	description: string
	id: VocaDBArtistId
	mainPicture?: {
		mime: string
		urlOriginal: string
		urlSmallThumb: string
		urlThumb: string
		urlTinyThumb: string
	}
	name: string
	names: VocaDBNameEntry[]
	pictureMime: string
	status: string
	version: number
	webLinks: VocaDBWebLink[]
	releaseDate?: string
}
