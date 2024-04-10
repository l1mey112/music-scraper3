import { $ } from 'bun'
import { Database } from 'bun:sqlite'

const sqlite: Database = new Database('db.sqlite', { create: false, readwrite: true })

const music_dataset = '/home/l-m/git/music-scraper2/media'
const glob = new Bun.Glob("**/*.{mp3,webm}")
const files = await Array.fromAsync(glob.scan(music_dataset))

async function extract_fingerprint(fp: string): Promise<{ duration_s: number, fingerprint: Uint32Array }> {
	type FpCalcRawJson = { duration: number, fingerprint: number[] }

	const fpcalc = await $`fpcalc -algorithm 2 -raw -json ${fp}`.quiet()
	if (fpcalc.exitCode !== 0) {
		throw new Error(`fpcalc failed: ${fpcalc.stderr}`)
	}
	const json: FpCalcRawJson = fpcalc.json()

	return { duration_s: json.duration, fingerprint: new Uint32Array(json.fingerprint) }
}

export async function run_with_concurrency_limit<T>(arr: Iterable<T>, concurrency_limit: number, next: (v: T) => Promise<void>): Promise<void> {
	const active_promises: Promise<void>[] = []

	for (const item of arr) {
		// wait until there's room for a new operation
		while (active_promises.length >= concurrency_limit) {
			await Promise.race(active_promises)
		}

		const next_operation = next(item)
		active_promises.push(next_operation)

		next_operation.finally(() => {
			const index = active_promises.indexOf(next_operation)
			if (index !== -1) {
				active_promises.splice(index, 1)
			}
		})
	}

	// wait for all active operations to complete
	await Promise.all(active_promises)
}

const to_append = sqlite.prepare(
	`insert into sources (hashpath, duration_s, chromaprint) values (?, ?, ?)`,
)

await run_with_concurrency_limit(files.entries(), 100, async ([idx, file]) => {
	const fp = `${music_dataset}/${file}`

	const k = await extract_fingerprint(fp)

	to_append.run(file, k.duration_s, new Uint8Array(k.fingerprint.buffer))

	console.log(`Inserted ${file} (${idx}/${files.length})`)
})
