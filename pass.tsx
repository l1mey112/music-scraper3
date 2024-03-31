import { CredentialKind } from "./cred"

type PassState = {
	state: PassStateEnum
	idx: number
	single_step: boolean
	breakpoints: Set<number>
	changed: boolean
}

// state machine
// - running -> pause
// - running -> finished
// - pause -> single step | run to completion | stop
// - single step -> running
// - run to completion -> running

enum PassStateEnum {
	Running,
	Pause,
	Finished,
}

type PassField = 'track' | 'album' | 'artist'
type PassKind = 'meta' | 'extrapolate' | 'media'
type PassIdentifier = `${PassField}.${PassKind}.${string}`

type PassFnReturn = boolean | void

type PassBlock = {
	name: PassIdentifier // split('.', 3)
	fn: () => PassFnReturn | Promise<PassFnReturn>
	cred?: CredentialKind[] // capabilities
}

const passes: PassBlock[] = [
	{ name: 'track.meta.weak', fn: () => false },
]

function pass_update() {
	return (
		<table>
			
		</table>
	)
}

let pass_state: PassState

function pass_reset() {
	pass_state = {
		idx: 0,
		breakpoints: new Set(),
		single_step: false,
		changed: false,
		state: PassStateEnum.Pause,
	}
}

async function pass_run() {
	pass_state.state = PassStateEnum.Running

	if (pass_state.idx == 0) {
		pass_state.changed = false
	}

	exit: do {
		for (; pass_state.idx < passes.length; pass_state.idx++) {
			const pass = passes[pass_state.idx]
			if (await pass.fn()) {
				pass_state.changed = true

				if (pass_state.single_step || pass_state.breakpoints.has(pass_state.idx)) {
					pass_state.state = PassStateEnum.Pause
					break exit
				}
			}
		}
		pass_state.idx = 0
	} while (pass_state.changed)

	if (!pass_state.changed) {
		pass_state.state = PassStateEnum.Finished 
	}
}
