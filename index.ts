import './server' // sideeffect
import './cred' // sideeffect

// for some reason, beforeExit is not being called
// it only works on a forced `process.exit(0)`
process.on("SIGINT", () => {
	console.log('SIGINT')
	process.exit(0)
})