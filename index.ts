

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

import { emit_log, PanelText, PanelRef, ProgressRef } from "./server";

let messagebox!: PanelText
let nmessagebox!: PanelText

const p = new PanelRef("panel title", c => {
	c(nmessagebox = new PanelText())
	c(messagebox = new PanelText())
})

const pc = new ProgressRef("progress count")


nmessagebox.text("nice to meet you")

let countdown = 100

while (countdown > 0) {
	pc.emit(100 - countdown)
	messagebox.text("hello world " + countdown)
	await Bun.sleep(10)
	countdown -= 1
}

pc.emit(100)
p.close()

/* while (true) {
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
} */
