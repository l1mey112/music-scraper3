import { ServerWebSocket } from "bun";

// @ts-ignore - need this for autoreloads on edit
import index from './ui-static/index.html'
import { MaybePromise } from "./types"

const js = Bun.file('./ui-static/index.js')
const font = Bun.file('./ui-static/TerminusTTF.woff2')

interface ToString {
	toString(): string
}

type ContainerOOBId = 'left' | 'right'
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

	const oob = pane_id == 'left' ? 'beforeend' : 'afterbegin'
	
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
			default: {
				console.log(`404 Not Found: ${url.pathname}`)
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

console.log('server: listening on http://localhost:8080')

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

		components.set(this, 'right')
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

	components.set(elm, 'right')
	component_append(elm)
}