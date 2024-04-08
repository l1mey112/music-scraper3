import { CredentialKind } from "./cred"
import { ProgressRef, component_invalidate, component_register, emit_log, route_register } from "./server"
import { MaybePromise, PassIdentifier } from "./types"
import { sql } from "drizzle-orm"
import * as schema from './schema'
import { db } from "./db"

import { pass_youtube_channel_extrapolate_from_channel_id, pass_youtube_channel_meta_youtube_channel, pass_youtube_video_meta_youtube_video } from "./passes/youtube"
import { pass_all_extrapolate_from_links, pass_links_classify_link_shorteners, pass_links_classify_strong, pass_links_classify_weak } from "./passes/links"
import { pass_images_download_images } from "./passes/images"
import { pass_sources_download_from_youtube_video } from "./passes/youtube_download"
import { pass_sources_classify_chromaprint } from "./passes/chromaprint"
import { pass_links_extrapolate_from_karent_album, pass_links_extrapolate_from_linkcore } from "./passes/links_distributors"

const passes: PassElement[] = [
	{ name: 'youtube_video.meta.youtube_video', fn: pass_youtube_video_meta_youtube_video },
	{ name: 'youtube_channel.extrapolate.from_channel_id', fn: pass_youtube_channel_extrapolate_from_channel_id },
	{ name: 'youtube_channel.meta.youtube_channel', fn: pass_youtube_channel_meta_youtube_channel },
	{
		blocks: [
			{ name: 'links.classify.link_shorteners', fn: pass_links_classify_link_shorteners },
			{ name: 'links.classify.weak', fn: pass_links_classify_weak },
			{ name: 'links.classify.strong', fn: pass_links_classify_strong },
			{ name: 'links.extrapolate.from_karent_album', fn: pass_links_extrapolate_from_karent_album },
			{ name: 'links.extrapolate.from_linkcore', fn: pass_links_extrapolate_from_linkcore },
			{ name: 'all.extrapolate.from_links', fn: pass_all_extrapolate_from_links },
		],
	},
	{ name: 'images.download.images', fn: pass_images_download_images },
	{ name: 'sources.download.from_youtube_video', fn: pass_sources_download_from_youtube_video },
	{ name: 'sources.classify.chromaprint', fn: pass_sources_classify_chromaprint },
]

const TRIP_COUNT_MAX = 10

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
		if ('blocks' in block) {
			state.blocks.push(walk_passes(block.blocks, state))
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

type PassGroup = { blocks: PassElement[] }
type PassElement = PassGroup | PassBlock

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

			const pass = pass_state.current_pass.blocks[pass_state.current_pass.idx]
			if ('blocks' in pass) {
				pass_state.current_pass.idx++
				pass_state.current_pass = pass
			}

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

			if (await pass.fn()) {
				pass_state.current_pass.mutations.add(pass_state.current_pass.idx)
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

route_register('POST', 'pass_run', pass_run)
route_register('POST', 'pass_stop', pass_stop)
route_register('POST', 'pass_toggle_st', pass_toggle_st)
route_register('POST', 'pass_toggle_bp', pass_toggle_bp)
component_register(pass_tostring, 'left')

export async function run_with_concurrency_limit<T>(arr: T[], concurrency_limit: number, ref: ProgressRef | undefined, next: (v: T) => Promise<void>): Promise<void> {
	if (arr.length == 0) {
		return
	}
	
	const active_promises: Promise<void>[] = []

	if (ref) {
		ref.emit(0)
	}

	let di = 0
	const diff = 100 / arr.length
	for (const item of arr) {
		// wait until there's room for a new operation
		while (active_promises.length >= concurrency_limit) {
			await Promise.race(active_promises)
		}

		const next_operation = next(item)
		active_promises.push(next_operation)

		// update progress
		if (ref) {
			di += diff
			ref.emit(di)
		}

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

// run M operations per N milliseconds
// https://thoughtspile.github.io/2018/07/07/rate-limit-promises/
// this doesn't really follow the guide, it may be suboptimal but ehh
export async function run_with_throughput_limit<T>(arr: T[], M: number, N: number, ref: ProgressRef | undefined, next: (v: T) => Promise<void>): Promise<void> {
	if (arr.length == 0) {
		return
	}
	
	type Operation = { item: Promise<void>, date: Date }
	
	// in flight operation | last operation time
	const active_promises: Operation[] = []

	if (ref) {
		ref.emit(0)
	}

	let di = 0
	const diff = 100 / arr.length
	for (const item of arr) {
		// insert
		if (active_promises.length < M) {
			active_promises.push({ item: next(item), date: new Date(Date.now() + N) })
			continue
		}

		// find operation with the oldest date

		let oldest_idx = 0
		for (let i = 1; i < active_promises.length; i++) {
			if (active_promises[i].date < active_promises[oldest_idx].date) {
				oldest_idx = i
			}
		}

		// Bun sleeps up till the date
		const oldest = active_promises[oldest_idx]
		await oldest.item
		await Bun.sleep(oldest.date)

		// update progress
		if (ref) {
			di += diff
			ref.emit(di)
		}

		// replace
		active_promises[oldest_idx] = { item: next(item), date: new Date(Date.now() + N) }
	}

	await Promise.all(active_promises.map(v => v.item))
}
