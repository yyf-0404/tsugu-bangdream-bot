export type RankingSourceOrder = Record<string, string[]>;

/** Each entry is a base URL; old source names are retained as address aliases only. */
function sourceUrl(source: string, aliases: Record<string, string>): string {
    const address = Object.prototype.hasOwnProperty.call(aliases, source) ? aliases[source] : source;
    let url: URL;
    try {
        url = new URL(address);
    } catch {
        throw new Error('排名数据源必须填写完整的 HTTP(S) 基础地址');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
        throw new Error('排名数据源必须使用 HTTP(S)，基础地址不能包含查询参数或片段');
    }
    return url.href.replace(/\/+$/, '');
}

export function parseRankingSources(value: string | undefined, aliases: Record<string, string>): RankingSourceOrder {
    if (!value?.trim()) return {};
    let data: unknown;
    try {
        data = JSON.parse(value);
    } catch {
        throw new Error('RANKING_SOURCES 必须是 JSON 对象，例如 {"cn":["https://example.com"]}');
    }
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('RANKING_SOURCES 必须是 JSON 对象');
    const result: RankingSourceOrder = {};
    for (const [server, sources] of Object.entries(data)) {
        if (!['jp', 'en', 'tw', 'cn', 'kr', 'global', 'default'].includes(server)) {
            throw new Error(`RANKING_SOURCES 中的服务器 ${server} 无效`);
        }
        if (!Array.isArray(sources) || sources.some(source => typeof source !== 'string' || !source.trim())) {
            throw new Error(`RANKING_SOURCES.${server} 必须是地址数组`);
        }
        result[server] = sources.map(source => sourceUrl(source.trim(), aliases));
    }
    return result;
}

export function resolveRankingSources(
    server: string,
    defaults: RankingSourceOrder,
    overrides: RankingSourceOrder,
    aliases: Record<string, string>,
): { url: string; name: string }[] {
    const sources = overrides[server] ?? overrides.default ?? defaults[server] ?? defaults.default ?? ['bestdori'];
    const seen = new Set<string>();
    const result: { url: string; name: string }[] = [];
    for (const source of sources) {
        const url = sourceUrl(source.trim(), aliases);
        if (seen.has(url)) continue;
        seen.add(url);
        const address = new URL(url);
        result.push({ url, name: address.host + address.pathname.replace(/\/+$/, '') });
    }
    return result;
}
