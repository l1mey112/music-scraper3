#!/usr/bin/env bun

// auto recompile script for hdist sqlite extension

import { $ } from 'bun'
import { suffix } from 'bun:ffi'
import fs from 'fs'

const so = `hdist.${suffix}`

const c_stat = fs.statSync("hdist.c")
const so_stat = fs.statSync(so, { throwIfNoEntry: false })

if (!so_stat || so_stat.atimeMs - c_stat.atimeMs < 0) {
	console.log('hdist_recompile: recompiling')
	await $`cc -fPIC -shared -march=native -O3 hdist.c -o ${so}`
}
