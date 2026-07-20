import { Server } from "../types/Server";
import { getReplyFromBackend } from "../api/getReplyFromBackend"
import { Config } from '../config';

export async function commandTopPointStat(config: Config, eventId: number, limit:string, playerId: string, tier: number, mainServer: Server): Promise<Array<Buffer | string>> {
    return await getReplyFromBackend(`${config.backendUrl}/topPointStat`, {
        mainServer,
        eventId,
        limit,
        playerId,
        tier,
        compress: config.compress,
    })
}
