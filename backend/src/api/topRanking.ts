import { callAPIAndCacheResponse } from '@/api/getApi';
import { resolveSourceUrls } from '@/config';
import { logger } from '@/logger';
import { Server } from '@/types/Server';
import { LegacyTopResponse, TopData, TopHistoryResponse, normalizeLegacyTop, normalizeTopHistory } from '@/types/TopRanking';

export async function getTopRankingData(
    server: Server,
    sourceOrder: Record<string, string[]>,
    kind: 'event' | 'monthly',
    periodId: number,
    legacyPath: string,
): Promise<TopData | undefined> {
    for (const source of resolveSourceUrls(Server[server], sourceOrder)) {
        // 按接口响应识别格式，每个地址都先尝试完整历史，再尝试兼容接口。
        try {
            const history = await callAPIAndCacheResponse(
                `${source.url}/api/top/history?server=${server}&kind=${kind}&periodId=${periodId}`, 0, 1,
            ) as TopHistoryResponse;
            if (Array.isArray(history?.samples) && (history.samples.some(sample => sample.type !== 'GAP') || (history.baseline?.ranking && !history.baseline.gap))) {
                const data = normalizeTopHistory(history);
                if (data.points.length) {
                    // 历史接口不含资料；兼容接口包含曾经上榜、现已离榜的玩家资料。
                    try {
                        const legacy = await callAPIAndCacheResponse(`${source.url}${legacyPath}`, 0, 3) as LegacyTopResponse;
                        data.users = legacy.users ?? [];
                    } catch {
                        logger('topRanking', `${source.name} 玩家资料获取失败，使用 UID`);
                    }
                }
                return data;
            }
        } catch {
            logger('topRanking', `${source.name} 新版历史不可用，尝试兼容接口`);
        }
        try {
            const data = await callAPIAndCacheResponse(`${source.url}${legacyPath}`, 0, 3) as LegacyTopResponse;
            if (data?.['result'] !== false && Array.isArray(data?.points) && data.points.length) return normalizeLegacyTop(data);
        } catch {
            logger('topRanking', `${source.name} 获取排名数据失败，尝试下一个数据源`);
        }
    }
    return undefined;
}
