import { downloadFile } from '@/api/downloadFile'
import { recordAssetCacheEntry } from '@/monitoring/memoryMonitor'

const cache: { [url: string]: Buffer } = {};

async function downloadFileCache(url: string,IgnoreErr = true): Promise<Buffer> {
    if (cache[url]) {
        // 如果已经有缓存，则直接返回缓存数据
        //console.log(`已有缓存:${url}`)
        return cache[url];
    }
    // 下载文件
    const data = await downloadFile(url,IgnoreErr)
    // 将下载的文件缓存起来
    if (process.env.MEMORY_CACHE == 'true') {
        // A concurrent request may have populated the cache while this request
        // was downloading. Keep monitoring counters aligned with retained data.
        if (!cache[url]) {
            cache[url] = data;
            recordAssetCacheEntry(data.length);
        }
        return cache[url];
    }
    return data;
}

export { downloadFileCache }
