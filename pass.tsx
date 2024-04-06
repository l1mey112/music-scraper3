import { SQLiteColumn } from "drizzle-orm/sqlite-core"
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

const passes: PassBlock[] = [
	{ name: 'youtube_video.meta.youtube_video', fn: pass_youtube_video_meta_youtube_video },
	{ name: 'youtube_channel.extrapolate.from_channel_id', fn: pass_youtube_channel_extrapolate_from_channel_id },
	{ name: 'youtube_channel.meta.youtube_channel', fn: pass_youtube_channel_meta_youtube_channel },
	{ name: 'links.classify.link_shorteners', fn: pass_links_classify_link_shorteners },
	{ name: 'links.classify.weak', fn: pass_links_classify_weak },
	{ name: 'links.classify.strong', fn: pass_links_classify_strong },
	// { name: 'all.extrapolate.from_links', fn: pass_all_extrapolate_from_links },
	{ name: 'images.download.images', fn: pass_images_download_images },
	{ name: 'sources.download.from_youtube_video', fn: pass_sources_download_from_youtube_video },
	{ name: 'sources.classify.chromaprint', fn: pass_sources_classify_chromaprint },
]

const TRIP_COUNT_MAX = 10

type PassState = {
	state: PassStateEnum
	idx: number
	single_step: boolean
	breakpoints: Set<number>
	mutations: Set<number>
	trip_count: number
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

type PassBlock = {
	name: PassIdentifier // split('.', 3)
	fn: () => MaybePromise<boolean | void>
	cred?: CredentialKind[] // capabilities
}

function pass_stop() {
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

	exit: do {
		if (pass_state.idx == 0) {
			pass_state.mutations.clear()
		}
		while (pass_state.idx < passes.length) {
			component_invalidate(pass_tostring)
			const pass = passes[pass_state.idx]
			if (await pass.fn()) {
				pass_state.mutations.add(pass_state.idx)
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
		pass_state.trip_count++
		if (pass_state.trip_count >= TRIP_COUNT_MAX) {
			emit_log(`[pass_job] forward progress trip count exceeded max of <i>${TRIP_COUNT_MAX}</i>`, 'error')
			pass_state.state = PassStateEnum.Stopped
			pass_state.trip_count = 0
			break exit
		}
	} while (pass_state.mutations.size > 0)

	// single stepping over the last pass
	if (pass_state.idx >= passes.length) {
		pass_state.idx = 0
	}

	if (pass_state.mutations.size == 0) {
		pass_state.trip_count = 0
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

function pass_tostring() {
	return (
		<table id="pass-table">
			<thead>
				<tr>
					<td style="text-align: end;">{pass_state.trip_count}</td>
					<td>Pass</td>
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
					let pass_mut_class = ''
					if (pass_state.mutations.has(idx)) {
						pass_mut_class = 'table-running'
					}

					// TODO: impl active
					return (
						<tr>
							<td class={pass_class}>
								<input checked={pass_state.breakpoints.has(idx)} hx-trigger="click" hx-vals={`{"idx":${idx}}`} hx-swap="none" hx-post={`/ui/pass_toggle_bp`} type="checkbox" name="state" id={id} />
								<label for={id} />
							</td>
							<td class={pass_class}>{pass.name}</td>
							<td class={pass_mut_class}>()</td>
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
					<td class={pass_state.mutations.size > 0 ? 'table-running' : ''}>()</td>
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
	mutations: new Set(),
	state: PassStateEnum.Stopped,
	trip_count: 0,
}

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
