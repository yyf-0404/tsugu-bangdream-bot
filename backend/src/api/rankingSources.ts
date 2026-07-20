import { callAPIAndCacheResponse } from '@/api/getApi';
import { resolveSourceUrls } from '@/config';
import { logger } from '@/logger';
import { Server } from '@/types/Server';

type SourceOrder = Record<string, string[]>;

export async function callRankingSources<T extends object>(
    server: Server | string,
    sourceOrder: SourceOrder,
    apiPath: string,
    cacheTime: number = 0,
    retryCount: number = 3,
    isValid: (data: T) => boolean = (data) => data != null && data['result'] !== false,
): Promise<T | undefined> {
    const serverName = typeof server === 'string' ? server : Server[server];
    const sources = resolveSourceUrls(serverName, sourceOrder);

    for (const source of sources) {
        try {
            const data = await callAPIAndCacheResponse(
                `${source.url}${apiPath}`,
                cacheTime,
                retryCount,
            ) as T;
            if (isValid(data)) return data;
            logger('rankingSources', `${source.name} 返回无效排名数据，尝试下一个数据源`);
        } catch (error) {
            logger('rankingSources', `${source.name} 获取排名数据失败，尝试下一个数据源`);
        }
    }
    return undefined;
}
