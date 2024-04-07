import { $ } from 'bun'
import { chromaprint_encode_raw } from './chromaprint_coding'

async function extract_fingerprint(fp: string): Promise<[Uint32Array, string]> {
	type FpCalcJson = { duration: number, fingerprint: string }
	type FpCalcRawJson = { duration: number, fingerprint: number[] }
	
	const fpcalc0 = await $`fpcalc -raw -json ${fp}`.quiet()
	if (fpcalc0.exitCode !== 0) {
		throw new Error(`fpcalc0 failed: ${fpcalc0.stderr}`)
	}
	const json0: FpCalcRawJson = fpcalc0.json()

	const fpcalc1 = await $`fpcalc -json ${fp}`.quiet()
	if (fpcalc1.exitCode !== 0) {
		throw new Error(`fpcalc1 failed: ${fpcalc1.stderr}`)
	}
	const json1: FpCalcJson = fpcalc1.json()

	return [new Uint32Array(json0.fingerprint), json1.fingerprint]
}

const [fp0, fp1] = await extract_fingerprint("hole-dwelling-kikuo-11025.mp3")

const fp2 = chromaprint_encode_raw(fp0)

console.log(fp1)
console.log(fp2)