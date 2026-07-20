import { Server } from "../types/Server";
import { getReplyFromBackend } from "../api/getReplyFromBackend"
import { Config } from '../config';

export async function commandTopRateRanking(config: Config, mainServer: Server, length: number, date: Date, compareTier?: number, compareUid? :number): Promise<Array<Buffer | string>> {
  return await getReplyFromBackend(`${config.backendUrl}/topRateRanking`, {
    mainServer,
    length,
    date: date?.getTime(),
    compareTier,
    compareUid,
    compress: config.compress,
  })
}
