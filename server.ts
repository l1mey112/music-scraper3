import type { ServerWebSocket } from "bun";

const index = Bun.file('ui/index.html')
const font = Bun.file('ui/TerminusTTF.woff2')

const sockets = new Set<ServerWebSocket>()
const panels = new Set<PanelRef>()

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
				return new Response(index)
			}
			case '/TerminusTTF.woff2': {
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

function emit_html(message: string) {
	for (const ws of sockets) {
		ws.send(message)
	}
}

// safe invalidated identifiers
const id_map = new WeakMap<IdRef, boolean>()

type IdRef = {
	toString(): string
	invalidate(): void
}

function new_id() {
	// TODO: fix this garbage, though the rest is fine
	const id = Math.random().toString(36).substring(2, 8)
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

export class PanelText {
	private ref: IdRef
	private message: string = ''

	constructor() {
		this.ref = new_id()
	}

	text(message: string) {
		this.message = message
		emit_html(`${this}`)
	}

	toString() {
		return `<div id="p${this.ref}"><p>${this.message}</p></div>`
	}
}

type PanelElementRef = PanelText

export class PanelRef {
	private title: string
	private id: IdRef

	constructor(title: string, init: (c: (_: PanelElementRef) => void) => void) {
		this.title = title
		this.id = new_id()
		panels.add(this)

		let buf = ''

		function commit(c: PanelElementRef) {
			buf += `${c}`
		}

		init(commit)

		const panel = `<div class="box" id="p${this.id}"><p>${this.title}</p><hr color=gray>${buf}</div>`
		emit_html(`<div id="panel" hx-swap-oob="beforebegin">${panel}</div>`)
	}

	close() {
		// TODO: not invalidating the id of child elements
		//       should probably move to a simpler system wherein we don't do anything
		//       and raise errors inside HTMX itself on not found ids

		emit_html(`<div id="p${this.id}" remove-me></div>`)
		this.id.invalidate()
		panels.delete(this)
	}
}

export class ProgressRef {
	private ref: IdRef
	private message: string
	private progress: number

	constructor(message: string) {
		this.ref = new_id()
		this.message = message
		this.progress = 0

		emit_html(`<div id="log" hx-swap-oob="beforebegin">${this}</div>`)
	}

	toString() {
		// random animation duration jittering around 1s
		const time = 1 + Math.random() * 0.5

		let remove_me = ``
		if (this.progress == 100) {
			remove_me = ` remove-me="${time}s"`
		}

		const progress_bar = `<div class="box"${remove_me} id="b${this.ref}"><p>${this.message}</p><div class="prog" style="width: ${this.progress}%;" id="p${this.ref}"></div></div>`

		return progress_bar
	}

	emit(progress: number) {
		this.progress = Math.min(Math.max(progress, 0), 100) // clamp

		emit_html(`${this}`)

		if (progress == 100) {
			this.ref.invalidate()
		}
	}
}

// TODO: add emit_log()

type LogLevel = 'log' | 'warn' | 'error'

export function emit_log(message: string, level: LogLevel = 'log') {
	const log = `<div class="box"><p class="${level}">${message}</p></div>`
	emit_html(`<div id="log" hx-swap-oob="beforebegin">${log}</div>`)
}