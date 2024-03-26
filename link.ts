// type YoutubeVideoId = string

type Link = 
	| { kind: 'youtube_video_id',     data: string } // base64
	| { kind: 'youtube_channel_id',   data: string } // base64 (normalised from multiple sources, youtube.com/@MitsumoriMusic as well)
	| { kind: 'youtube_playlist_id',  data: string } // base64 - youtube.com/playlist?list={}
	| { kind: 'spotify_track_id',     data: string } // open.spotify.com/track/{}
	| { kind: 'spotify_artist_id',    data: string } // open.spotify.com/artist/{}
	| { kind: 'spotify_album_id',     data: string } // open.spotify.com/album/{}
	| { kind: 'apple_album_id',       data: string } // music.apple.com/_/album/_/{}
	| { kind: 'piapro_item_id',       data: string } // piapro.jp/t/{}
	| { kind: 'piapro_creator_id',    data: string } // piapro.jp/{} + piapro.jp/my_page/?view=content&pid={}
	| { kind: 'linkcore_id',          data: string } // linkco.re/{}
	| { kind: 'niconico_video_id',    data: string } // www.nicovideo.jp/watch/{}
	| { kind: 'niconico_user_id',     data: string } // www.nicovideo.jp/user/{}
	| { kind: 'niconico_material_id', data: string } // commons.nicovideo.jp/material/{}
	| { kind: 'twitter_id',           data: string } // twitter.com/{} + x.com/{}
	| { kind: 'tiktok_id',            data: string } // www.tiktok.com/@{}
	| { kind: 'gdrive_folder_id',     data: string } // drive.google.com/drive/folders/{}
	| { kind: 'gdrive_file_id',       data: string } // drive.google.com/file/d/{}/(view|edit)
	| { kind: 'gdrive_docs_id',       data: string } // docs.google.com/document/d/{}/(view|edit)
	| { kind: 'instagram_user_id',    data: string } // instagram.com/{}
	| { kind: 'unknown',              data: string } // full URL

// convert every link to unknown then run passes