import type { ServerWebSocket } from "bun";

const index = Bun.file('ui/index.html')
const font = Bun.file('ui/TerminusTTF.woff2')

const sockets = new Set<ServerWebSocket>()

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

console.log('listening on http://localhost:8080')

export async function busy_wait_for_users() {
	while (sockets.size === 0) {
		await new Promise((resolve) => setTimeout(resolve, 1))
	}
}

function emit_raw_html(message: string) {
	for (const ws of sockets) {
		ws.send(message)
	}
}

let nprogid = 0

class ProgressRef {
	ref: number
	private _inv: boolean

	constructor() {
		this.ref = nprogid++
		this._inv = false
	}

	emit(progress: number) {
		// i don't think HTMX will even perform a DOM update when an invalid (id not found) progress is emitted
		if (this._inv) {
			throw new Error("ProgressRef: emit() called when invalidated")
		}

		const need_to_remove = progress >= 100
		progress = Math.min(Math.max(progress, 0), 100) // clamp

		let progress_bar = `<div class="prog" style="width: ${progress}%;" id="p${this.ref}"></div>`

		emit_raw_html(progress_bar)

		if (need_to_remove) {
			this._inv = true
			///_hyperscript
			console.log('remove')
			//progress_bar += `<div _="on htmx:afterSettle 1 remove #b${this.ref}">`
			const k = `<div _="on htmx:afterSettle 1 remove #b${this.ref}">`
			emit_raw_html(k)
		}

	}
}

export function emit_progress(message: string): ProgressRef {
	const p = new ProgressRef()
	const progress_bar = `<div class="prog" style="width: 75%;" id="p${p.ref}"></div>`
	emit_html_prepend(`<div class="box" id="b${p.ref}"><p>${message}</p>${progress_bar}</div>`)
	return p
}

function emit_html_prepend(message: string) {
	emit_raw_html(`<div id="log" hx-swap-oob="afterend">${message}</div>`)
}

// TODO: add emit_log()
