import { emit_log, PanelRef, ProgressRef } from "./server";

let whatlevel = 0
process.on('SIGINT', () => {
	const g = new ProgressRef('what? ' + whatlevel++)

	const interval = setInterval(() => {
		g.emit(g.progress + 1)
		if (g.progress >= 100) {
			clearInterval(interval)
			g.close()
		}
	}, 100)
})

// normal stuff

const p = new PanelRef("panel testring hello")
const pc = new ProgressRef("progress count")

let countdown = 100

while (countdown > 0) {
	pc.emit(100 - countdown)
	await Bun.sleep(10)
	countdown -= 1

	emit_log(`countdown: ${countdown}`)
	emit_log(`countdown: ${countdown}`, 'warn')
	emit_log(`countdown: ${countdown}`, 'error')

	p.html(`countdown: ${countdown}`)
}

p.html('hello world more test')

pc.emit(100)
pc.close()
