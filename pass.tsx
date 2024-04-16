import { CredentialKind } from "./cred"
import { component_invalidate, component_register, emit_log, route_register } from "./server"
import { MaybePromise, PassIdentifier } from "./types"
import { passes } from "./passes"

class StopPass extends Error {
	constructor() {
		super('StopPass')
	}
}

export function pass_force_stop(): never {
	throw new StopPass()
}

const TRIP_COUNT_MAX = 20

type PassState = {
	state: PassStateEnum
	single_step: boolean
	current_pass: PassGroupState
	parent_pass: PassGroupState
}

type PassGroupState = {
	parent?: PassGroupState | undefined
	idx: number
	breakpoints: Set<number>
	mutations: Set<number>
	trip_count: number
	blocks: PassElementState[]
}

type PassElementState = PassGroupState | PassBlock

function walk_passes(blocks: PassElement[], parent?: PassGroupState): PassGroupState {
	const state: PassGroupState = {
		idx: 0,
		breakpoints: new Set(),
		mutations: new Set(),
		trip_count: 0,
		parent,
		blocks: [],
	}

	for (const block of blocks) {
		if (block instanceof Array) {
			state.blocks.push(walk_passes(block, state))
		} else {
			state.blocks.push(block)
		}
	}

	return state
}

type PassBlock = {
	name: PassIdentifier // split('.', 3)
	fn: () => MaybePromise<boolean | void>
	cred?: CredentialKind[] // capabilities
}

export type PassElement = PassElement[] | PassBlock

enum PassStateEnum {
	Running,
	ReadyNext,
	PendingStop,
	Stopped,
	Finished,
}

let pass_state: PassState = {
	state: PassStateEnum.Stopped,
	single_step: false,
	current_pass: walk_passes(passes),
	parent_pass: undefined as any
}

pass_state.parent_pass = pass_state.current_pass

function passstate_tostring(v: PassStateEnum) {
	switch (v) {
		case PassStateEnum.Running: return 'Running'
		case PassStateEnum.ReadyNext: return 'ReadyNext'
		case PassStateEnum.PendingStop: return 'PendingStop'
		case PassStateEnum.Stopped: return 'Stopped'
		case PassStateEnum.Finished: return 'Finished'
	}
}

// Running, Finished -> ReadyNext
//
// ReadyNext -> Running -> ReadyNext (run pass)
//                state := idx++
//
// ReadyNext (single_step) -> Stopped
// ReadyNext (breakpoint on idx) -> Stopped
//
// Running (user action) -> PendingStop
// PendingStop, ReadyNext -> Stopped
//
// ReadyNext, Stopped (end + !mutation) -> Finished
//
// Stopped, Finished -> ReadyNext (run button)

// AfterRunning -> ReadyNext -> Running

function pass_stop() {
	if (pass_state.state == PassStateEnum.Running) {
		pass_state.state = PassStateEnum.PendingStop
	}
	component_invalidate(pass_tostring)
}

let inside_pass_job = false

async function state_machine() {
	// default state should be Running

	switch (pass_state.state) {
		case PassStateEnum.PendingStop:
		case PassStateEnum.Finished:
		case PassStateEnum.Stopped:
		case PassStateEnum.ReadyNext: {
			if (pass_state.current_pass.idx >= pass_state.current_pass.blocks.length) {
				pass_state.current_pass.idx = 0

				if (pass_state.current_pass.mutations.size == 0) {
					pass_state.current_pass.trip_count = 0

					if (pass_state.current_pass.parent) {
						pass_state.current_pass = pass_state.current_pass.parent
						pass_state.current_pass.idx++
						// needs to check for breakpoints, will come back here
						if (pass_state.state != PassStateEnum.PendingStop) {
							pass_state.state = PassStateEnum.ReadyNext
						}
						return
					} else {
						pass_state.state = PassStateEnum.Finished
					}
					return
				}

				pass_state.current_pass.trip_count++

				if (pass_state.current_pass.trip_count >= TRIP_COUNT_MAX) {
					emit_log(`[pass_job] forward progress trip count exceeded max of <i>${TRIP_COUNT_MAX}</i>`, 'error')
					pass_state.state = PassStateEnum.Finished
					pass_state.current_pass.trip_count = 0
					return
				}
			}

			if (pass_state.current_pass.idx == 0) {
				pass_state.current_pass.mutations.clear()
			}

			// recursively enter the next pass
			let pass
			do {
				pass = pass_state.current_pass.blocks[pass_state.current_pass.idx]
				if ('blocks' in pass) {
					pass_state.current_pass = pass
				}
			} while ('blocks' in pass)

			if (pass_state.state == PassStateEnum.PendingStop) {
				pass_state.state = PassStateEnum.Stopped
				return
			}

			// single step or breakpoint
			if (pass_state.state != PassStateEnum.Finished && pass_state.state != PassStateEnum.Stopped) {
				if (pass_state.single_step || pass_state.current_pass.breakpoints.has(pass_state.current_pass.idx)) {
					pass_state.state = PassStateEnum.Stopped
					return
				}
			}
			pass_state.state = PassStateEnum.Running
			break
		}
		case PassStateEnum.Running: {
			const pass = pass_state.current_pass.blocks[pass_state.current_pass.idx] as PassBlock

			try {
				await Bun.sleep(10) // much cooler than instananous execution
				if (await pass.fn()) {
					pass_state.current_pass.mutations.add(pass_state.current_pass.idx)
				}
			} catch (e) {
				pass_state.state = PassStateEnum.Stopped
				if (e instanceof StopPass) {
					break
				}
				emit_log(`[pass_job] ${e}`, 'error')
				emit_log(`[pass_job] pass <i>${pass.name}</i> failed`, 'error')
				throw e
			}

			pass_state.current_pass.idx++

			// typescript narrowing has no idea about other functions and their side effects
			if ((pass_state.state as PassStateEnum) != PassStateEnum.PendingStop) {
				pass_state.state = PassStateEnum.ReadyNext
			}
			break
		}
	}
}

// you know, this should be an async generator
async function pass_job() {
	inside_pass_job = true

	do {
		await state_machine()
		component_invalidate(pass_tostring)
	} while ((pass_state.state as PassStateEnum) != PassStateEnum.Finished && (pass_state.state as PassStateEnum) != PassStateEnum.Stopped)

	inside_pass_job = false
}

function pass_run() {
	if (pass_state.state == PassStateEnum.Running) {
		return
	}

	if (inside_pass_job) {
		return
	}

	if (pass_state.state == PassStateEnum.Finished) {
		function walk_reset(state: PassGroupState) {
			state.idx = 0
			state.mutations.clear()
			for (const block of state.blocks) {
				if ('blocks' in block) {
					walk_reset(block)
				}
			}
		}

		pass_state.current_pass = pass_state.parent_pass
		walk_reset(pass_state.current_pass)
	}

	pass_job()
}

function pass_tostring_element(pass: PassGroupState, idx: number, element: PassElementState, idchain: string, iddepth: number): JSX.Element {
	if ('blocks' in element) {
		return <>
			{pass_tostring_walk(element, idchain, iddepth + 1)}
		</>
	}

	let pass_class = ''
	if (idx == pass.idx && pass == pass_state.current_pass) {
		switch (pass_state.state) {
			case PassStateEnum.ReadyNext:
			case PassStateEnum.Running: pass_class = 'table-running'; break
			case PassStateEnum.PendingStop: pass_class = 'table-pending-stop'; break
			case PassStateEnum.Finished:
			case PassStateEnum.Stopped: pass_class = 'table-stopped'; break
		}
	}
	let pass_mut_class = ''
	if (pass.mutations.has(idx)) {
		pass_mut_class = 'table-running'
	}

	let colour_style = ''
	if (iddepth > 0) {
		// nice colours taken from vscode-indent-rainbow
		const colours = [
			"rgba(255,255,64,0.6)",
			"rgba(127,255,127,0.6)",
			"rgba(255,127,255,0.6)",
			"rgba(79,236,236,0.6)",
		]

		colour_style = `border-left: 1px solid ${colours[(iddepth - 1) % colours.length]} !important;`
	}

	return (
		<tr>
			<td style={colour_style} class={pass_class}>
				<input checked={pass.breakpoints.has(idx)} hx-trigger="click" hx-vals={`{"idx":"${idchain}"}`} hx-swap="none" hx-post={`/ui/pass_toggle_bp`} type="checkbox" name="state" id={idchain} />
				<label for={idchain} />
			</td>
			<td class={pass_class}>{element.name}</td>
			<td class={pass_mut_class}>()</td>
		</tr>
	)
}

function pass_tostring_walk(state: PassGroupState, idchain: string = '', iddepth = 0) {
	return (
		<>
			{...state.blocks.map((pass, idx) => pass_tostring_element(state, idx, pass, idchain + '-' + idx, iddepth))}
		</>
	)
}

function pass_tostring() {
	return (
		<div id="pass-table">
			<table>
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
				<tbody>
					{pass_tostring_walk(pass_state.parent_pass, 'pass')}
				</tbody>
				<thead>
					<tr>
						<td style="text-align: end;">{pass_state.current_pass.trip_count}</td>
						<td>Pass</td>
					</tr>
				</thead>
			</table>
		</div>
	)
}

async function pass_toggle_st(req: Request) {
	const data = await req.formData()

	pass_state.single_step = data.get('state') == 'on'
}

async function pass_toggle_bp(req: Request) {
	try {
		const data = await req.formData()

		const is_checked = data.get('state') == 'on'
		const idx = data.get('idx') as string // NaN on anything else

		// pass-1-5-0-2 -> pass.blocks[1].blocks[5].blocks[0].blocks[2]

		const idx_split = idx.split('-').slice(1).map(v => parseInt(v))
		const idx_last = idx_split.pop() as number

		let pass = pass_state.parent_pass
		for (const idx of idx_split) {
			pass = pass.blocks[idx] as PassGroupState
		}

		if (is_checked) {
			pass.breakpoints.add(idx_last)
		} else {
			pass.breakpoints.delete(idx_last)
		}
	} catch {
		// invalid index
	}
}

export function ui_init_pass() {
	route_register('POST', 'pass_run', pass_run)
	route_register('POST', 'pass_stop', pass_stop)
	route_register('POST', 'pass_toggle_st', pass_toggle_st)
	route_register('POST', 'pass_toggle_bp', pass_toggle_bp)
	component_register(pass_tostring, 'left')
}
