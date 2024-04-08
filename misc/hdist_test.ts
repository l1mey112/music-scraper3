import { Database } from 'bun:sqlite'
import { $ } from 'bun'

async function extract_fingerprint(fp: string): Promise<Uint32Array> {
	type FpCalcRawJson = { duration: number, fingerprint: number[] }

	const fpcalc = await $`fpcalc -rate 11025 -raw -json ${fp}`.quiet()
	if (fpcalc.exitCode !== 0) {
		throw new Error(`fpcalc failed: ${fpcalc.stderr}`)
	}
	const json: FpCalcRawJson = fpcalc.json()

	return Uint32Array.from(json.fingerprint)
}

const sqlite: Database = new Database(':memory:')

await $`cd .. && sh/hdist_compile.ts`

sqlite.loadExtension("../hdist")
const query = sqlite.prepare("select acoustid_compare2(?, ?, ?)")

const [fp0, fp1] = await Promise.all([extract_fingerprint("DVI-angel-panic.webm"), extract_fingerprint("DVI-angel-panic-visualiser.webm")])

console.log(query.get(new Uint8Array(fp0.buffer), new Uint8Array(fp1.buffer), 80))