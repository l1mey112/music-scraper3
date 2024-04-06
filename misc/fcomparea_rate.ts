import { $ } from 'bun'

type FpCalcRawJson = { duration: number, fingerprint: number[] }

const persecs = []

for (let length = 20; length <= 260; length += 5) {
	const fpcalc = await $`fpcalc -length ${length} -raw -json hole-dwelling-kikuo.webm`.quiet()
	if (fpcalc.exitCode !== 0) {
		throw new Error(`fpcalc failed: ${fpcalc.stderr}`)
	}
	const json: FpCalcRawJson = fpcalc.json()

	const fingerprint = new Uint32Array(json.fingerprint)

	const persec = fingerprint.length / length

	console.log(`size in bytes: ${fingerprint.length * 4}`)
	console.log(`${persec}`)

	persecs.push(persec)
}

console.log(persecs)
console.log('mean', persecs.reduce((a, b) => a + b, 0) / persecs.length)

// mean is ~7.8 meaning one second of audio is ~7.8 bytes
// doesn't change when the analysis rate changes at all
