import { ServerWebSocket } from "bun";

// @ts-ignore - need this for autoreloads on edit
import index from './ui-static/index.html'
import { FSRef, MaybePromise } from "./types"
import { db_fs_hash_path } from "./db_misc";

const js = Bun.file('./ui-static/index.js')
const font = Bun.file('./ui-static/TerminusTTF.woff2')

interface ToString {
	toString(): string
}

type ContainerOOBId = 'left' | 'rightlog' | 'right0' | 'right1'
type RenderFn = ToString | ((init: boolean) => MaybePromise<ToString>)

const sockets = new Set<ServerWebSocket>()
const components = new Map<RenderFn, ContainerOOBId>() // element, pane id map ordered by insertion

function emit_html(message: string, targets: Set<ServerWebSocket> = sockets) {
	for (const ws of targets) {
		ws.send(message)
	}
}

export function component_register(element: RenderFn, oob: ContainerOOBId) {
	if (components.has(element)) {
		throw new Error(`component ${element} already registered`)
	}
	components.set(element, oob)
}

// only async if RenderFn is async, otherwise don't bother
async function component_append(element: RenderFn, targets: Set<ServerWebSocket> = sockets) {
	const pane_id = components.get(element)
	if (!pane_id) {
		throw new Error("element not found in elements map")
	}
	if (typeof element === 'function') {
		element = await element(true)
	}

	const oob = pane_id == 'rightlog' ? 'afterbegin' : 'beforeend'

	emit_html(`<div id="${pane_id}" hx-swap-oob="${oob}">${element}</div>`, targets)
}

export async function component_invalidate(element: RenderFn, targets: Set<ServerWebSocket> = sockets) {
	// we can get away without checking this honestly
	if (!components.get(element)) {
		throw new Error("element not found in elements map")
	}
	if (typeof element === 'function') {
		element = await element(false)
	}
	emit_html(`${element}`, targets)
}

type RouteFn = (req: Request) => MaybePromise<string | void>
const route_map = new Map<string, RouteFn>()

type HTTPMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'OPTIONS' | 'TRACE' | 'PATCH'

export function route_register(method: HTTPMethod, route: string, f: RouteFn) {
	const str = `${method}:/ui/${route}`
	if (route_map.has(str)) {
		throw new Error(`route ${str} already registered`)
	}
	route_map.set(str, f)
}

Bun.serve<undefined>({
	port: 8080,
	error(e) {
		console.error(e)
		return new Response("500 Internal Server Error", { status: 500 });
	},
	async fetch(req, server) {
		const url = new URL(req.url)

		const route = route_map.get(`${req.method}:${url.pathname}`)
		if (route) {
			// void can mean any value, just that it isn't observable
			// who cares? if my function returns `void` im just going to treat it as `undefined`
			return new Response(await route(req) as string | undefined, {
				headers: {
					'Content-Type': 'text/html',
				}
			})
		}

		switch (url.pathname) {
			case '/':
			case '/index.html': {
				// content type not known by bun
				return new Response(index, {
					headers: {
						'Content-Type': 'text/html',
					}
				})
			}
			case '/index.js': {
				// content type known
				return new Response(js)
			}
			case '/TerminusTTF.woff2': {
				// content type known
				return new Response(font)
			}
			case '/api/ws': {
				const success = server.upgrade(req)
				if (success) {
					return undefined
				}
				return new Response("400 Bad Request", { status: 400 })
			}
			case '/media': {
				const q = url.searchParams.get('q')
				if (!q) {
					return new Response("400 Bad Request", { status: 400 })
				}

				// don't bother checking if the hash is in the db
				// its most likely fine

				const path = db_fs_hash_path(q as FSRef)
				const file = Bun.file(path)

				if (!file.exists) {
					return new Response("404 Not Found", { status: 404 })
				}

				return new Response(file)
			}
			default: {
				return new Response("404 Not Found", { status: 404 })
			}
		}
	},
	websocket: {
		async open(ws) {
			sockets.add(ws)
			for (const [element, _] of components) {
				await component_append(element, new Set([ws]))
			}
		},
		close(ws) {
			sockets.delete(ws)
		},
		message(ws, data) {}
	},
})

// safe invalidated identifiers
const id_map = new WeakMap<IdRef, boolean>()

type IdRef = {
	toString(): string
	invalidate(): void
}

function new_id() {
	// ids must not start with numbers
	function random(length: number) {
		let text = ""
		const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
		for (let i = 0; i < length; i++) {
			text += charset.charAt(Math.floor(Math.random() * charset.length))
		}
		return text;
	}

	const id = random(8)
	const id_ref: IdRef = {} as IdRef

	id_ref.toString = function() {
		if (!id_map.has(id_ref) || !id_map.get(id_ref)) {
			throw new Error("id_ref.toString(): id invalidated")
		}
		return id
	}
	id_ref.invalidate = function() {
		if (id_map.has(id_ref) && !id_map.get(id_ref)) {
			throw new Error("id_ref.invalidate(): id invalidated already")
		}
		id_map.set(id_ref, false)
	}

	id_map.set(id_ref, true)
	return id_ref
}

export class ProgressRef {
	private id: IdRef
	private message: string
	progress: number

	constructor(message: string) {
		this.id = new_id()
		this.message = message
		this.progress = 0

		components.set(this, 'rightlog')
		component_append(this)
	}

	toString() {
		return `<div class="box" id="${this.id}"><pre>${this.message}</pre><div class="prog" style="width: ${this.progress}%;"></div></div>`
	}

	emit(progress: number) {
		this.progress = Math.min(Math.max(progress, 0), 100) // clamp
		emit_html(`${this}`)
	}

	close() {
		// much better instead of closing on 100%, less error prone
		emit_html(`<div id="${this.id}" remove-me></div>`)
		this.id.invalidate()
		components.delete(this)
	}
}

type LogLevel = 'log' | 'warn' | 'error'

export function emit_log(message: string, level: LogLevel = 'log') {
	const elm = {
		toString() {
			return `<div class="box ${level}"><pre>${message}</pre></div>`
		}
	}

	components.set(elm, 'rightlog')
	component_append(elm)
}

// console.log overrides

const log_setup = ['log', 'warn', 'error'] as const

for (const level of log_setup) {
	const orig = console[level]

	console[level] = function log(obj: any, ...args: any[]) {
		//let prefix = `[${log.caller}]`

		// cant access `caller` in strict mode, use an exception to get the stack trace
		//let prefix = new Error().stack?.split('\n')[2].trim()

		let prefix = ''

		if (typeof obj === 'string') {
			args.unshift(prefix + obj)
		} else {
			args.unshift(obj)
			args.unshift(prefix)
		}

		orig(...args)
		emit_log(args.join(' '), level)
	}
}

console.log('server: listening on http://localhost:8080')
