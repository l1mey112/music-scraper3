import YTMusic from "ytmusic-api"

const api = new YTMusic()
await api.initialize()

const v0 = await api.getSong("vjBFftpQxxM") // AV
//console.log(JSON.stringify(v0))

const v1 = await api.getSong("o4dxH06Jgp0") // music
//console.log(JSON.stringify(v1))

const l0 = await api.getLyrics("xi3mKfd0qGU")
console.log(l0)
