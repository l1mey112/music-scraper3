import { parse } from 'tldts';

const g: string[] = await Bun.file("video_urls.json").json()

const subs = new Map<string, string[]>()

for (const i of g) {
	const urlp = parse(i)
	const d = urlp.domain!

	let k
	if (k = subs.get(d)) {
		k.push(i)
	} else {
		subs.set(d, [i])
	}
}

console.log(JSON.stringify(Object.fromEntries(subs)))