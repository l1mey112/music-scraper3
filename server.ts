import type { ServerWebSocket } from "bun";

// @ts-ignore - need this for autoreloads on edit
import index from './ui/index.html'

const font = Bun.file('./ui/TerminusTTF.woff2')

interface HTMXElement {
	toString(): string
}

const sockets = new Set<ServerWebSocket>()
const elements = new Map<HTMXElement, string>() // element, pane id map ordered by insertion

function emit_html(message: string, targets: Set<ServerWebSocket> = sockets) {
	for (const ws of targets) {
		ws.send(message)
	}
}

function emit_element(element: HTMXElement, targets: Set<ServerWebSocket> = sockets) {
	const pane_id = elements.get(element)
	if (!pane_id) {
		throw new Error("element not found in elements map")
	}
	emit_html(`<div id="${pane_id}" hx-swap-oob="beforebegin">${element}</div>`, targets)
}

Bun.serve<undefined>({
	port: 8080,
	error(e) {
		console.error(e)
		return new Response("500 Internal Server Error", { status: 500 });
	},
	async fetch(req, server) {
		const url = new URL(req.url)

		if (req.method !== 'GET') {
			return new Response("405 Method Not Allowed", { status: 405 })
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
				return new Response("404 Not Found", { status: 404 })
			}
		}
	},
	websocket: {
		open(ws) {
			sockets.add(ws)
			for (const [element, _] of elements) {
				emit_element(element, new Set([ws]))
			}
		},
		close(ws) {
			sockets.delete(ws)
		},
		message(ws, data) {}
	},
})

console.log('server: listening on http://localhost:8080')
console.log('server: busy waiting for users to connect...')
while (sockets.size === 0) {
	await new Promise((resolve) => setTimeout(resolve, 1))
}

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

// panels can be created and destroyed, with updates changing everything inside

export class PanelRef {
	private title: string
	private id: IdRef
	private innerhtml: string

	constructor(title: string) {
		this.title = title
		this.id = new_id()
		this.innerhtml = ''

		elements.set(this, 'leftappend')
		emit_element(this)
	}

	toString() {
		return `<div class="box" id="${this.id}"><p>${this.title}</p><hr color=gray>${this.innerhtml}</div>`
	}

	html(innerhtml: string) {
		this.innerhtml = innerhtml
		emit_html(`${this}`)
	}

	close() {
		emit_html(`<div id="${this.id}" remove-me></div>`)
		this.id.invalidate()
		elements.delete(this)
	}
}

export class ProgressRef {
	private id: IdRef
	private message: string
	progress: number

	constructor(message: string) {
		this.id = new_id()
		this.message = message
		this.progress = 0

		elements.set(this, 'rightappend')
		emit_element(this)
	}

	toString() {
		return `<div class="box" id="${this.id}"><p>${this.message}</p><div class="prog" style="width: ${this.progress}%;"></div></div>`
	}

	emit(progress: number) {
		this.progress = Math.min(Math.max(progress, 0), 100) // clamp
		emit_html(`${this}`)
	}

	close() {
		// much better instead of closing on 100%, less error prone
		emit_html(`<div id="${this.id}" remove-me></div>`)
		this.id.invalidate()
		elements.delete(this)
	}
}

type LogLevel = 'log' | 'warn' | 'error'

export function emit_log(message: string, level: LogLevel = 'log') {
	const elm = {
		toString() {
			return `<div class="box ${level}"><pre>${message}</pre></div>`
		}
	}

	elements.set(elm, 'rightappend')
	emit_element(elm)
}