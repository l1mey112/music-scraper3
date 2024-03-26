import { youtube_channel, youtube_id_from_url, youtube_video } from "./youtube_api_meta";

export async function run_with_concurrency_limit<T>(arr: T[], concurrency_limit: number, next: (v: T) => Promise<void>): Promise<void> {
	const active_promises: Promise<void>[] = [];

	for (const item of arr) {
		// wait until there's room for a new operation
		while (active_promises.length >= concurrency_limit) {
			await Promise.race(active_promises);
		}

		const next_operation = next(item);
		active_promises.push(next_operation);

		next_operation.finally(() => {
			const index = active_promises.indexOf(next_operation);
			if (index !== -1) {
				active_promises.splice(index, 1);
			}
		});
	}

	// wait for all active operations to complete
	await Promise.all(active_promises);
}

const all: string[] = await Bun.file("k.json").json()

const url_regex = /(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?/ig
const channel_urls_in_all = new Set<string>()
const video_urls_in_all = new Set<string>()

console.log(all)

await run_with_concurrency_limit(all, 4, async (url) => {
	const video_id = youtube_id_from_url(url)!

	try {
		const video = await youtube_video(video_id)
		const channel_id = video.channelId

		for (const url of video.description.matchAll(url_regex)) {
			console.log(`new_video_url(${video_id}):`, url)
			video_urls_in_all.add(url[0])
		}

		const channel = await youtube_channel(channel_id)
		
		for (const url of channel.about.links) {
			console.log(`new_channel_url(${channel_id}):`, url.url)
			channel_urls_in_all.add(url.url)
		}
	} catch {
		console.error('failed', video_id)
	}
})

Bun.write(Bun.file("channel_urls.json"), JSON.stringify(Array.from(channel_urls_in_all)))
Bun.write(Bun.file("video_urls.json"), JSON.stringify(Array.from(video_urls_in_all)))