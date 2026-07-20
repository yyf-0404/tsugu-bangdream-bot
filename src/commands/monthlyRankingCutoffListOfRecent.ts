import { Server } from '../types/Server';
import { getReplyFromBackend } from "../api/getReplyFromBackend"
import { Config } from '../config';

export async function commandMonthlyRankingCutoffListOfRecent(config: Config, mainServer: Server, tier: number, monthlyRankingId: number): Promise<Array<Buffer | string>> {
    return await getReplyFromBackend(`${config.backendUrl}/monthlyRankingCutoffListOfRecent`, {
        mainServer,
        tier,
        monthlyRankingId,
        compress: config.compress
    })
}
