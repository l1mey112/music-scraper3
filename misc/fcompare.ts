import { $ } from 'bun'

async function extract_fingerprint(fp: string): Promise<Uint32Array> {
	type FpCalcRawJson = { duration: number, fingerprint: number[] }
	
	const fpcalc = await $`fpcalc -algorithm 2 -rate 11025 -raw -json ${fp}`.quiet()
	if (fpcalc.exitCode !== 0) {
		throw new Error(`fpcalc failed: ${fpcalc.stderr}`)
	}
	const json: FpCalcRawJson = fpcalc.json()

	return new Uint32Array(json.fingerprint)
}

function popcnt(n: number) {
	n = n - ((n >> 1) & 0x55555555)
	n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
	return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}

function seconds(duration: number) {
	return Math.round(duration * 7)
}

function fingerprint_compare0(fp0: Uint32Array, fp1: Uint32Array): number {
	const length = Math.min(fp0.length, fp1.length)

	if (length < seconds(10)) {
		return 0.0
	}

	let error = 0
	for (let i = 0; i < length; i++) {
		const xor = fp0[i] ^ fp1[i]
		error += popcnt(xor)
	}

	return 1.0 - error / (length * 32)
}

function fingerprint_compare1(fp0: Uint32Array, fp1: Uint32Array): number {
	const CONFIDENCE_SCORE = 0.665
	const CORRECTION = 0.95
	const SCORE_MEDIAN_DELTA = 0.04

	const length = Math.min(fp0.length, fp1.length)

	if (length < seconds(10)) {
		//console.log("length < 10")
		return 0.0
	}

	function *slices() {
		const step = seconds(0.3)
		const span = Math.min(Math.floor(length / 4), seconds(5))
		// ???????? limit becomes negative somehow
		// ???????? limit = span to run at least once
		let limit = Math.max(fp0.length, fp1.length) - length - span
		// TODO: fix this
		//console.log('span', span, 'limit', limit, 'length', length, 'step', step, 'fp0.length', fp0.length, 'fp1.length', fp1.length)

		if (limit < 0) {
			limit = span
		}

		for (let offset = span; offset > 0; offset -= step) {
			yield [fp1.subarray(offset), fp0]
		}
		for (let offset = 0; offset < limit; offset += step) {
			yield [fp0.subarray(offset), fp1]
		}
	}

	const correlations = []
	let max_correlation = 0
	let max_ci = 0 // always assigned

	let i = 0
	for (const [slice0, slice1] of slices()) {
		const length = Math.min(slice0.length, slice1.length)

		let error = 0
		for (let i = 0; i < length; i++) {
			const xor = slice0[i] ^ slice1[i]
			error += popcnt(xor)
		}

		const correlation = 1.0 - error / (length * 32)
		if (correlation > max_correlation) {
			max_correlation = correlation
			max_ci = i
		}
		correlations.push(correlation)
		i++
	}

	if (max_correlation >= CONFIDENCE_SCORE) {
		//console.log("max_correlation >= CONFIDENCE_SCORE")
		return max_correlation
	}

	if (length < seconds(20)) {
		max_correlation *= CORRECTION
	}

	const offset = 5
	const samples = [...correlations.slice(max_ci - offset, max_ci), ...correlations.slice(max_ci + 1, max_ci + offset + 1)]
	const median = samples.reduce((a, b) => a + b, 0) / samples.length

	if (max_correlation - median > SCORE_MEDIAN_DELTA) {
		//console.log("max_correlation - median > SCORE_MEDIAN_DELTA")
		return max_correlation
	}

	//console.log("return 0.0")
	return 0.0
}

function fingerprint_compare2(fp0: Uint32Array, fp1: Uint32Array): number {
	function simhash(fp: Uint32Array) {
		const v = new Array<number>(32)

		for (let i = 0; i < fp.length; i++) {
			const local_hash = fp[i]
			for (let j = 0; j < 32; j++) {
				v[j] += (local_hash & (1 << j)) ? 1 : -1
			}
		}

		let hash = 0
		for (let i = 0; i < 32; i++) {
			if (v[i] > 0) {
				hash |= (1 << i)
			}
		}

		return hash
	}

	const [hash0, hash1] = [simhash(fp0), simhash(fp1)]	

	const xor = hash0 ^ hash1
	//return 1.0 - popcnt(xor) / 32
	return popcnt(xor) < 16 ? 1.0 : 0.0
}

const glob = new Bun.Glob("*.{mp3,webm}")
const files = await Array.fromAsync(glob.scan())

import { Database } from 'bun:sqlite'

const sqlite: Database = new Database(':memory:')
sqlite.loadExtension("../hdist")

const query = sqlite.prepare<{ score: number }, any>("select acoustid_compare2(?, ?, ?) as score")

// make files^2 comparisons
for (const file0 of files) {
	for (const file1 of files) {
		if (file0 === file1) {
			continue
		}

		const [fp0, fp1] = await Promise.all([
			extract_fingerprint(file0),
			extract_fingerprint(file1),
		])

		/* const fpc0 = fingerprint_compare0(fp0, fp1)
		const fpc1 = fingerprint_compare1(fp0, fp1)
		const fpc2 = fingerprint_compare2(fp0, fp1)

		console.log(`${file0} vs ${file1}:`)
		console.log(`\tv0`, fpc0.toPrecision(4))
		console.log(`\tv1`, fpc1.toPrecision(4))
		console.log(`\tv2`, fpc2.toPrecision(4)) */

		console.log(`${file0}`)
		console.log(`${file1}`)
		const fp = query.get(new Uint8Array(fp0.buffer), new Uint8Array(fp1.buffer), 80)!
		console.log(`\t`, fp.score)
	}
}