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

export class ProgressRef {
	ref: number
	message: string
	progress: number
	private _inv: boolean

	constructor(message: string) {
		this.ref = nprogid++
		this.message = message
		this._inv = false
		this.progress = 0
		
		emit_html_prepend(`${this}`)
	}

	toString() {
		// random animation duration jittering around 1s
		const time = 1 + Math.random() * 0.5

		const remove_me = this.progress == 100 ? ` remove-me="${time}s"` : ``
		const progress_bar = `<div class="box"${remove_me} id="b${this.ref}"><p>${this.message}</p><div class="prog" style="width: ${this.progress}%;" id="p${this.ref}"></div></div>`

		return progress_bar
	}

	emit(progress: number) {
		this.progress = Math.min(Math.max(progress, 0), 100) // clamp

		// i don't think HTMX will even perform a DOM update when an invalid (id not found) progress is emitted
		if (this._inv) {
			throw new Error("ProgressRef: emit() called when invalidated")
		}

		emit_raw_html(`${this}`)

		if (progress >= 100) {
			this._inv = true
		}
	}
}

function emit_html_prepend(html: string) {
	emit_raw_html(`<div id="log" hx-swap-oob="beforebegin">${html}</div>`)
}

// TODO: add emit_log()

type LogLevel = 'log' | 'warn' | 'error'

function emit_log(message: string, level: LogLevel = 'log') {
	const log = `<div class="box" hx-swap-oob="afterend" id="log"><p class="${level}">${message}</p></div>`
	emit_raw_html(log)
}