import { sql } from "drizzle-orm"
import { spotify_api } from "../cred_api"
import { db, db_ident_pk_with } from "../db"
import { $spotify_album, $spotify_artist, $spotify_track } from "../schema"
import { ProgressRef } from "../server"
import { db_backoff, db_backoff_forever, db_backoff_or_delete, db_backoff_sql } from "../util"
import { ArtistList, Locale, LocaleRef, LocaleNone, LocalePart, SpotifyAlbumId, SpotifyArtistId, SpotifyTrackId } from "../types"
import { locale_insert } from "../locale"
import { Album, Artist, Track } from "@spotify/web-api-ts-sdk"
import { db_images_append_url } from "./images"

function append_artist_ids(artists: ArtistList<SpotifyArtistId>) {
	if (artists.length > 0) {
		db.insert($spotify_artist)
			.values(artists.map(id => ({ id: id })))
			.onConflictDoNothing()
			.run()
	}
}

function append_album_ids(albums: SpotifyAlbumId[]) {
	if (albums.length > 0) {
		db.insert($spotify_album)
			.values(albums.map(id => ({ id: id })))
			.onConflictDoNothing()
			.run()
	}
}

function append_track_ids(ids: SpotifyTrackId[]) {
	if (ids.length > 0) {
		db.insert($spotify_track)
			.values(ids.map(id => ({ id: id })))
			.onConflictDoNothing()
			.run()
	}
}

// track.meta.spotify
export async function pass_track_meta_spotify() {
	const DIDENT = 'track.meta.spotify'

	// to avoid backoff bloat, will only assign a forever backoff if the track doesn't exist
	// otherwise to signal completion, it'll check the metadata in the db entry

	let updated = false
	const k = db.select({ id: $spotify_track.id })
		.from($spotify_track)
		.where(sql`(spotify_disc_number is null or spotify_track_number is null or spotify_album_id is null)
			and ${db_backoff_sql(DIDENT, $spotify_track, $spotify_track.id)}`)
		.all()

	if (k.length === 0) {
		return
	}

	const sp = new ProgressRef(DIDENT)
	const api = spotify_api()

	// > A comma-separated list of the Spotify IDs. For example: ...
	// > Maximum: 100 IDs.

	// they lied here, it's 50

	for (let offset = 0; offset < k.length; offset += 50) {
		const batch = k.slice(offset, offset + 50)
		const ids = batch.map(it => it.id)

		const tracks: (Track | string)[] = await api.tracks.get(ids)

		// if null (track not exists), id is stored instead
		for (let i = 0; i < batch.length; i++) {
			if (!tracks[i]) {
				tracks[i] = ids[i]
			}
		}

		// append album
		// append artists
		// append name
		// set data

		for (const track of tracks) {
			if (typeof track === 'string') {
				db_backoff_or_delete(DIDENT, $spotify_track, $spotify_track.id, track)
				continue
			}

			const ident = db_ident_pk_with($spotify_track, track.id)

			const album = track.album.id as SpotifyAlbumId
			const artists = track.artists.map(it => it.id as SpotifyArtistId)

			const name: Locale = {
				ident,
				locale: 'en' as LocaleRef,
				part: LocalePart.name,
				text: track.name,
			}

			db.transaction(db => {
				append_album_ids([album])
				append_artist_ids(artists)

				locale_insert(name)

				db.update($spotify_track)
					.set({
						spotify_disc_number: track.disc_number,
						spotify_track_number: track.track_number,
						spotify_album_id: album,
						spotify_preview_url: track.preview_url,
						spotify_isrc: track.external_ids.isrc,
					})
					.where(sql`id = ${track.id}`)
					.run()
			})

			updated = true
		}

		sp.emit(offset / k.length * 100)
	}

	sp.close()

	return updated
}

// album.meta.spotify
export async function pass_album_meta_spotify() {
	const DIDENT = 'album.meta.spotify'

	// same backoff bloat avoidance as before

	let updated = false
	const k = db.select({ id: $spotify_album.id })
		.from($spotify_album)
		.where(sql`(spotify_track_count is null)
			and ${db_backoff_sql(DIDENT, $spotify_album, $spotify_album.id)}`)
		.all()

	if (k.length === 0) {
		return
	}

	const sp = new ProgressRef(DIDENT)
	const api = spotify_api()

	for (let offset = 0; offset < k.length; offset += 20) {
		const batch = k.slice(offset, offset + 20)
		const ids = batch.map(it => it.id)

		const albums: (Album | string)[] = await api.albums.get(ids)

		// if null (track not exists), id is stored instead
		for (let i = 0; i < batch.length; i++) {
			if (!albums[i]) {
				albums[i] = ids[i]
			}
		}

		// append tracks
		// append artist
		// append name
		// append picture/album art
		// set data

		for (const album of albums) {
			if (typeof album === 'string') {
				db_backoff_or_delete(DIDENT, $spotify_track, $spotify_track.id, album)
				continue
			}

			// most albums have < 50 tracks, the album request already provides us with enough
			// but in cases where it doesn't, we'll have to fetch the tracks separately

			const total_tracks = album.total_tracks
			const tracks = album.tracks.items

			if (album.tracks.total > total_tracks) {
				for (let offset = 50; tracks.length < total_tracks; offset += 50) {
					const next = await api.albums.tracks(album.id, undefined, 50, offset)
					console.log(`fetched ${next.items.length} tracks, total ${tracks.length + next.items.length} / ${total_tracks}`)
					tracks.push(...next.items)
				}
			}

			const ident = db_ident_pk_with($spotify_album, album.id)

			const name: Locale = {
				ident,
				locale: 'en' as LocaleRef,
				part: LocalePart.name,
				text: album.name,
			}

			db.transaction(db => {
				append_artist_ids(album.artists.map(it => it.id as SpotifyArtistId))
				append_track_ids(tracks.map(it => it.id as SpotifyTrackId))
				locale_insert(name)

				// > The cover art for the album in various sizes, widest first.
				const largest = album.images[0]

				db_images_append_url(ident, 'cover_art', largest.url, largest.width, largest.height)

				db.update($spotify_album)
					.set({
						spotify_track_count: album.total_tracks,
					})
					.where(sql`id = ${album.id}`)
					.run()
			})
			updated = true
		}

		sp.emit(offset / k.length * 100)
	}

	sp.close()

	return updated
}

// artist.meta.spotify
export async function pass_artist_meta_spotify() {
	const DIDENT = 'artist.meta.spotify'

	// artists can change over time

	let updated = false
	const k = db.select({ id: $spotify_artist.id })
		.from($spotify_artist)
		.where(db_backoff_sql(DIDENT, $spotify_artist, $spotify_artist.id))
		.all()

	if (k.length === 0) {
		return
	}

	const sp = new ProgressRef(DIDENT)
	const api = spotify_api()

	// > A comma-separated list of the Spotify IDs. For example: ...
	// > Maximum: 100 IDs.

	// they lied here AGAIN, it's 50

	for (let offset = 0; offset < k.length; offset += 50) {
		const batch = k.slice(offset, offset + 50)
		const ids = batch.map(it => it.id)

		const artists: (Artist | string)[] = await api.artists.get(ids)

		// if null (track not exists), id is stored instead
		for (let i = 0; i < batch.length; i++) {
			if (!artists[i]) {
				artists[i] = ids[i]
			}
		}

		// append name
		// append picture/artist art
		// set data

		for (const artist of artists) {
			if (typeof artist === 'string') {
				db_backoff_or_delete(DIDENT, $spotify_artist, $spotify_artist.id, artist)
				continue
			}

			const ident = db_ident_pk_with($spotify_artist, artist.id)

			const name: Locale = {
				ident,
				locale: 'en' as LocaleRef,
				part: LocalePart.name,
				text: artist.name,
			}

			db.transaction(db => {
				locale_insert(name)

				const largest = artist.images[0]

				if (largest) {
					db_images_append_url(ident, 'profile_art', largest.url, largest.width, largest.height)
				}

				db.update($spotify_artist)
					.set({
						spotify_genres: artist.genres,
					})
					.where(sql`id = ${artist.id}`)
					.run()

				db_backoff(DIDENT, ident)
			})
			updated = true
		}

		sp.emit(offset / k.length * 100)
	}

	sp.close()

	return updated
}
