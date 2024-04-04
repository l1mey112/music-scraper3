import { $ } from 'bun'

async function extract_fingerprint(fp: string): Promise<Uint32Array> {
	type FpCalcRawJson = { duration: number, fingerprint: number[] }
	
	const fpcalc = await $`fpcalc -raw -json ${fp}`.quiet()
	const json: FpCalcRawJson = fpcalc.json()

	return new Uint32Array(json.fingerprint)
}

const [fp0, fp1] = await Promise.all([extract_fingerprint("DVI-angel-panic.webm"), extract_fingerprint("DVI-angel-panic-visualiser.webm")])

function simhash(fp: Uint32Array) {
	const v = new Int32Array(32)

	for (let i = 0; i < fp.length; i++) {
		const local_hash = fp[i]
		for (let j = 0; j < 32; j++) {
			v[j] += (local_hash & (1 << j)) ? 1 : -1
		}
	}

	console.log(v)

	let hash = 0
	for (let i = 0; i < 32; i++) {
		if (v[i] > 0) {
			hash |= (1 << i)
			console.log(hash)
		}
	}

	return hash|0
}

const [hash0, hash1] = [simhash(fp0), simhash(fp1)]

console.log(hash0, hash1)