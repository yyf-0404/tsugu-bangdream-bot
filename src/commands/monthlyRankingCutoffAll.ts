
import { Server, getServerByName } from "../types/Server"
import { getReplyFromBackend } from "../api/getReplyFromBackend"

import { Config } from '../config';

export async function commandMonthlyRankingCutoffAll(config: Config, mainServer: Server, monthlyRankingId: number): Promise<Array<Buffer | string>> {
    return await getReplyFromBackend(`${config.backendUrl}/monthlyRankingCutoffAll`, {
        mainServer,
        monthlyRankingId,
        compress: config.compress
    })
}
