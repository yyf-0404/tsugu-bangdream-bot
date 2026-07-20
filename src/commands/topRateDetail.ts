import { Server } from "../types/Server";
import { getReplyFromBackend } from "../api/getReplyFromBackend"
import { Config } from '../config';

export async function commandTopRateDetail(config: Config, eventId: number, day:number, limit:string, count: number, playerId: string, tier: number, mainServer: Server): Promise<Array<Buffer | string>> {
    return await getReplyFromBackend(`${config.backendUrl}/topRateDetail`, {
        mainServer,
        eventId,
        day,
        limit,
        count,
        playerId,
        tier,
        compress: config.compress,
    })
}
