import YTMusic from "ytmusic-api"
import { emit_log } from "./server"

let api_ytmusic_instance: YTMusic | undefined

export async function api_ytmusic(): Promise<YTMusic> {
	if (!api_ytmusic_instance) {
		emit_log('[api_ytmusic] initialising <i>YTMusic instance</i>', 'log')
		api_ytmusic_instance = new YTMusic()
		await api_ytmusic_instance.initialize()
	}

	return api_ytmusic_instance
}
