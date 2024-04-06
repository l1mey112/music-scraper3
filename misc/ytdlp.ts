import * as YTDlpWrap from "yt-dlp-wrap";

const ytdl = new YTDlpWrap.default()

// best audio and video
const k = await ytdl.execPromise([
	"-f",
	"bestaudio+bestvideo",
	"https://www.youtube.com/watch?v=M_I6tASrnwk",
	"--print",
	"{\"ext\":%(ext)j,\"width\":%(width)j,\"height\":%(height)j}",
])

console.log(k)