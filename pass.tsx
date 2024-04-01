import { CredentialKind } from "./cred"
import { component_invalidate, component_register, emit_log, route_register } from "./server"
import { MaybePromise } from "./types"

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
// - pause -> single step | run to completion | stop | reset
// - finished -> reset
// - single step -> running
// - run to completion -> running

enum PassStateEnum {
	Running,
	PendingStop,
	Stopped,
}

type PassField = 'track' | 'album' | 'artist'
type PassKind = 'meta' | 'extrapolate' | 'media'
type PassIdentifier = `${PassField}.${PassKind}.${string}`

type PassFnReturn = boolean | void

type PassBlock = {
	name: PassIdentifier // split('.', 3)
	fn: () => MaybePromise<PassFnReturn>
	cred?: CredentialKind[] // capabilities
}

function pass_stop() {
	emit_log('pass_stop')
	if (pass_state.state == PassStateEnum.Running) {
		pass_state.state = PassStateEnum.PendingStop		
	}
	component_invalidate(pass_tostring)
}

let inside_pass_job = false

async function pass_job() {
	inside_pass_job = true

	// typescript narrowing has no idea about other functions and their side effects
	pass_state.state = PassStateEnum.Running as PassStateEnum

	if (pass_state.idx == 0) {
		pass_state.changed = false
	}

	exit: do {
		while (pass_state.idx < passes.length) {
			component_invalidate(pass_tostring)
			const pass = passes[pass_state.idx]
			if (await pass.fn()) {
				pass_state.changed = true
			}
			pass_state.idx++

			if (pass_state.single_step || pass_state.breakpoints.has(pass_state.idx)) {
				pass_state.state = PassStateEnum.PendingStop
			}

			if (pass_state.state == PassStateEnum.PendingStop) {
				pass_state.state = PassStateEnum.Stopped
				break exit
			}
		}
		pass_state.idx = 0
	} while (pass_state.changed)

	if (!pass_state.changed) {
		pass_state.state = PassStateEnum.Stopped
	}
	component_invalidate(pass_tostring)

	inside_pass_job = false
}

function pass_run() {
	if (pass_state.state == PassStateEnum.Running) {
		return
	}

	if (inside_pass_job) {
		return
	}

	pass_job()
}

const passes: PassBlock[] = [
	{ name: 'track.meta.weak0', fn: async () => await Bun.sleep(100) },
	{ name: 'track.meta.weak1', fn: async () => await Bun.sleep(100) },
	{ name: 'track.meta.weak2', fn: async () => await Bun.sleep(100) },
	{ name: 'track.meta.weak3', fn: async () => await Bun.sleep(100) },
	{ name: 'track.meta.weak4', fn: async () => await Bun.sleep(100) },
	{ name: 'track.meta.weak5', fn: async () => await Bun.sleep(100) },
	{ name: 'track.meta.weak6', fn: async () => await Bun.sleep(100) },
]

function pass_tostring() {
	return (
		<table id="pass-table">
			<thead>
				<tr>
					<td></td>
					<td class="tooltip">Pass</td>
				</tr>
			</thead>
			<tbody>
				{...passes.map((pass, idx) => {
					const id = `pass-table-ch${idx}`

					let pass_class = ''
					if (idx == pass_state.idx) {
						switch (pass_state.state) {
							case PassStateEnum.Running: pass_class = 'table-running'; break
							case PassStateEnum.PendingStop: pass_class = 'table-pending-stop'; break
							case PassStateEnum.Stopped: pass_class = 'table-stopped'; break
						}
					}

					// TODO: impl active
					return (
						<tr class={pass_class}>
							<td>
								<input checked={pass_state.breakpoints.has(idx)} hx-trigger="click" hx-vals={`{"idx":${idx}}`} hx-swap="none" hx-post={`/ui/pass_toggle_bp`} type="checkbox" name="state" id={id} />
								<label for={id} />
							</td>
							<td>{pass.name}</td>
						</tr>
					)
				})}
			</tbody>
			<tfoot>
				<tr>
					<td>
						<input checked={pass_state.single_step} hx-trigger="click" hx-swap="none" hx-post={`/ui/pass_toggle_st`} type="checkbox" name="state" id="pass-table-st" />
						<label class="tooltip" data-tooltip title="single step execution" for="pass-table-st" />
					</td>
					<td>
						<button hx-post="/ui/pass_run" hx-swap="none" hx-trigger="click">Run</button>
						<button hx-post="/ui/pass_stop" hx-swap="none" hx-trigger="click">Stop</button>
					</td>
				</tr>
			</tfoot>
		</table>
	)
}

async function pass_toggle_st(req: Request) {
	const data = await req.formData()

	pass_state.single_step = data.get('state') == 'on'
}

async function pass_toggle_bp(req: Request) {
	const data = await req.formData()

	const is_checked = data.get('state') == 'on'
	const idx = Number(data.get('idx')) // NaN on anything else

	if (is_checked) {
		pass_state.breakpoints.add(idx)
	} else {
		pass_state.breakpoints.delete(idx)
	}
}

route_register('POST', 'pass_run', pass_run)
route_register('POST', 'pass_stop', pass_stop)
route_register('POST', 'pass_toggle_st', pass_toggle_st)
route_register('POST', 'pass_toggle_bp', pass_toggle_bp)
component_register(pass_tostring, 'left')

let pass_state: PassState = {
	idx: 0,
	breakpoints: new Set(),
	single_step: false,
	changed: false,
	state: PassStateEnum.Stopped,
}
