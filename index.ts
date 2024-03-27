

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

import { busy_wait_for_users, emit_html, emit_log } from "./server";

await busy_wait_for_users()

emit_log(`<p>New Message For You ${new Date().getTime()}</p>`)
emit_html(`<div id="log" hx-swap-oob="afterend"><div class="box">
	<p>MessageNow</p>
	<div class="prog" style="width: 75%;" id="p0"></div>
</div></div>`)

let i = 0
while (true) {
	emit_html(`<div class="prog" style="width: ${i}%;" id="p0"></div>`)
	i += 1
	await Bun.sleep(100)

	if (i >= 100) {
		await busy_wait_for_users()
		i = 0
	}
}