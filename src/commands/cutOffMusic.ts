import { Server } from "../types/Server"
import { getReplyFromBackend } from "../api/getReplyFromBackend"
import { Config } from '../config';

export async function commandCutOffMusic(config: Config, mainServer: Server, tier: number, music: number | string, eventId?: number): Promise<Array<Buffer | string>> {
    return await getReplyFromBackend(`${config.backendUrl}/cutOffMusic`, {
        mainServer,
        tier,
        music,
        eventId,
        compress: config.compress
    })
}
