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

export function emit_html(message: string) {
	for (const ws of sockets) {
		ws.send(message)
	}
}

export function emit_log(message: string) {
	emit_html(`<div id="log" hx-swap-oob="afterend"><div class="box">${message}</div></div>`)
}