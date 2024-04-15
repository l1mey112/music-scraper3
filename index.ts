import { db_close } from './db'
import { ui_init_cred } from './cred'
import { ui_init_pass } from './pass'

function exit() {
	db_close()
	process.exit(0)
}

// for some reason, beforeExit is not being called
// it only works on a forced `process.exit(0)`
// TODO: raise this as an issue to bun
//       bun doesn't catch these signals
process.on("SIGINT", exit)
process.on("SIGTERM", exit)

ui_init_cred()
ui_init_pass()