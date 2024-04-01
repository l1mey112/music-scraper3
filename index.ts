import './server' // sideeffect
import './cred' // sideeffect
import './pass' // sideeffect
import { db_close } from './db'
import { meta_youtube_channel } from './passes/youtube'

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

// TODO: need channel display name
// TODO: impl appending to image_fs
// TODO: clean up code
