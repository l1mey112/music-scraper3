

/* for (const ws of sockets) {
	ws.send(`<div id="log" hx-swap-oob="afterend"><div class="box">New Message For You ${new Date().getTime()}</div></div>`)
}

for (const ws of sockets) {
	ws.send(`<div id="log" hx-swap-oob="afterend"><div class="box" id="p0">progress 0</div></div>`)
}

for (const ws of sockets) {
	ws.send(`<div id="log" hx-swap-oob="afterend"><div class="box">New Message For You ${new Date().getTime()}</div></div>`)
}

for (const ws of sockets) {
	ws.send(`<div class="box" id="p0">progress 150</div>`)
} */

import { busy_wait_for_users, emit_log, ProgressRef } from "./server";

await busy_wait_for_users()


while (true) {
	const p = new ProgressRef("progress count")

	let i = 0
	while (true) {
		if (i >= 100) {
			emit_log('among')
			emit_log('among', 'warn')
			emit_log('among', 'error')
			break
		}

		i += 1
		p.emit(i)

		await Bun.sleep(10)
	}
}