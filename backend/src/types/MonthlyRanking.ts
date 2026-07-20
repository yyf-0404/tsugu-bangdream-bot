import { Image, loadImage } from 'skia-canvas'
import { downloadFileCache } from '@/api/downloadFileCache'
import { Server, getServerByPriority } from '@/types/Server'
import mainAPI from '@/types/_Main';
import { globalDefaultServer, Bestdoriurl, MONTHRANKING_TURNS } from '@/config';
import { stringToNumberArray } from '@/types/utils'
import { arraysEqual } from '@/api/utils'
import { callRankingSources } from '@/api/rankingSources';

// Types provided by user for API shapes
export type MonthlyRankingInfo = {
    monthlyRankingName: Array<string | null>;
    assetBundleName: string;
    bgmFileName: string;
    startAt: Array<number | null>;
    endAt: Array<number | null>;
}

export interface GarupaMasterMonthlyRankingReward {
    id?: number;
    monthlyRankingId?: number;
    fromRank?: number;
    toRank?: number;
    rewardType?: string;
    rewardId?: number;
    rewardQuantity?: number;
}

export interface GarupaMasterMonthlyRankingGrade {
    id?: number;
    monthlyRankingId?: number;
    gradeAheadType?: string;
    pt?: number;
    rewardType?: string;
    rewardId?: number;
    rewardQuantity?: number;
    rankingThresholdFlg?: boolean;
}

export interface MonthlyRankingDetail extends MonthlyRankingInfo {
    monthlyRankingId: number;
    enableFlag: Array<boolean | null>;
    publicStartAt: Array<number | null>;
    publicEndAt: Array<number | null>;
    distributionStartAt: Array<number | null>;
    distributionEndAt: Array<number | null>;
    aggregateEndAt: Array<number | null>;
    receptionEndAt: Array<number | null>;
    rewards?: Array<GarupaMasterMonthlyRankingReward[] | null>;
    grades?: Array<GarupaMasterMonthlyRankingGrade[] | null>;
}

export class MonthlyRanking {
    monthlyRankingId: number;
    isExist: boolean = false;
    isInitFull: boolean = false;

    // basic info (from /api/monthlyRanking/info.json)
    monthlyRankingName: Array<string | null> = [];
    assetBundleName: string = '';
    bgmFileName: string = '';
    startAt: Array<number | null> = [];
    endAt: Array<number | null> = [];

    // detailed info (from /api/monthlyRanking/info.{id}.json)
    enableFlag?: Array<boolean | null>;
    publicStartAt?: Array<number | null>;
    publicEndAt?: Array<number | null>;
    distributionStartAt?: Array<number | null>;
    distributionEndAt?: Array<number | null>;
    aggregateEndAt?: Array<number | null>;
    receptionEndAt?: Array<number | null>;
    rewards?: Array<GarupaMasterMonthlyRankingReward[] | null>;
    grades?: Array<GarupaMasterMonthlyRankingGrade[] | null>;

    constructor(monthlyRankingId: number) {
        this.monthlyRankingId = monthlyRankingId;
        const monthlyRankingData = (mainAPI as any)['monthlyRanking'] ?? (mainAPI as any)['monthlyRankings'];
        const data = monthlyRankingData?.[monthlyRankingId.toString()] as MonthlyRankingInfo | undefined;
        if (!data) {
            this.isExist = false;
            return;
        }
        this.isExist = true;
        this.monthlyRankingName = data.monthlyRankingName;
        this.assetBundleName = data.assetBundleName;
        this.bgmFileName = data.bgmFileName;
        this.startAt = stringToNumberArray(data.startAt as any);
        this.endAt = stringToNumberArray(data.endAt as any);
    }

    async initFull(useCache: boolean = true) {
        if (this.isInitFull) return;
        if (!this.isExist) return;

        const detail = await this.getData(!useCache) as MonthlyRankingDetail;
        if (!detail) return;

        this.monthlyRankingName = detail.monthlyRankingName;
        this.assetBundleName = detail.assetBundleName;
        this.bgmFileName = detail.bgmFileName;
        this.startAt = stringToNumberArray(detail.startAt as any);
        this.endAt = stringToNumberArray(detail.endAt as any);

        this.enableFlag = detail.enableFlag;
        this.publicStartAt = stringToNumberArray(detail.publicStartAt as any);
        this.publicEndAt = stringToNumberArray(detail.publicEndAt as any);
        this.distributionStartAt = stringToNumberArray(detail.distributionStartAt as any);
        this.distributionEndAt = stringToNumberArray(detail.distributionEndAt as any);
        this.aggregateEndAt = stringToNumberArray(detail.aggregateEndAt as any);
        this.receptionEndAt = stringToNumberArray(detail.receptionEndAt as any);
        this.rewards = detail.rewards;
        this.grades = detail.grades;

        this.isInitFull = true;
    }

    // fetch detailed data
    async getData(update: boolean = true): Promise<MonthlyRankingDetail | MonthlyRankingInfo | undefined> {
        const ttl = update ? 0 : Infinity;
        const detailPath = `/api/monthlyRanking/info.${this.monthlyRankingId}.json`;
        let data = await callRankingSources<MonthlyRankingDetail>(
            'global',
            MONTHRANKING_TURNS,
            detailPath,
            ttl,
        );
        if (data) {
            // 缓存一致性校验：比对 mainAPI 数据，不一致时强制刷新。
            if (!update) {
                const mainData = (mainAPI as any)['monthlyRanking']?.[this.monthlyRankingId.toString()];
                if (mainData && !arraysEqual(data.startAt, mainData.startAt)) {
                    data = await callRankingSources<MonthlyRankingDetail>(
                        'global',
                        MONTHRANKING_TURNS,
                        detailPath,
                    );
                }
            }
            if (data) return data;
        }

        const all = await callRankingSources<{ [key: string]: MonthlyRankingInfo } | MonthlyRankingInfo[]>(
            'global',
            MONTHRANKING_TURNS,
            '/api/monthlyRanking/info.json',
            ttl,
        );
        if (!all) return undefined;
        return Array.isArray(all)
            ? all[this.monthlyRankingId]
            : all[this.monthlyRankingId.toString()];
    }

    async getBannerImage(displayedServerList: Server[] = globalDefaultServer): Promise<Image> {
        const server = getServerByPriority(this.startAt, displayedServerList) ?? Server.jp;
        const url = `${Bestdoriurl}/assets/${Server[server]}/homebanner_rip/banner_monthly_ranking.png`;
        const bannerBuffer = await downloadFileCache(url, false);
        return await loadImage(bannerBuffer)
    }

    // 月榜规则轮播图
    async getEventSlideImage(tempServer: Server): Promise<Image[]> {
        const server = getServerByPriority(this.startAt, [tempServer]) ?? Server.jp
        const result: Image[] = []
        const baseUrl = `${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/slide_rip/`
        let ruleNumber = 1
        while (true) {
            try {
                const url = `${baseUrl}rule${ruleNumber}.png`
                const slideImageBuffer = await downloadFileCache(url, false)
                result.push(await loadImage(slideImageBuffer))
            } catch (e) {
                break
            }
            ruleNumber++
        }
        return result
    }

    // 月榜背景图片
    async getEventBGImage(): Promise<Image> {
        const server = getServerByPriority(this.startAt) ?? Server.jp
        const url = `${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/topscreen_rip/bg_eventtop.png`
        const bgImageBuffer = await downloadFileCache(url)
        return await loadImage(bgImageBuffer)
    }

    // 月榜主界面trim
    async getEventTopscreenTrimImage(): Promise<Image> {
        const server = getServerByPriority(this.startAt) ?? Server.jp
        const url = `${Bestdoriurl}/assets/${Server[server]}/event/${this.assetBundleName}/topscreen_rip/trim_eventtop.png`
        const topScreenTrimImageBuffer = await downloadFileCache(url)
        return await loadImage(topScreenTrimImageBuffer)
    }

}

// 按时间范围获取符合条件的月榜
export function getMonthlyRankingListByTimeRange(rangeStart?: number, rangeEnd?: number, displayedServerList: Server[] = globalDefaultServer) {
    const monthlyRankingIdList: Array<number> = Object.keys((mainAPI as any)['monthlyRanking'] ?? (mainAPI as any)['monthlyRankings'] ?? {}).map(Number);
    const tempMonthlyRankingList: Array<MonthlyRanking> = [];

    if (rangeStart == null && rangeEnd == null) {
        return tempMonthlyRankingList;
    }

    for (let i = 0; i < monthlyRankingIdList.length; i++) {
        const monthlyRankingId = monthlyRankingIdList[i];
        const tempMonthlyRanking = new MonthlyRanking(monthlyRankingId);
        if (!tempMonthlyRanking.isExist) continue;

        for (let j = 0; j < displayedServerList.length; j++) {
            const server = displayedServerList[j];
            const timeWindow = getMonthlyRankingTimeWindowByServer(tempMonthlyRanking, server);

            if (!timeWindow) continue;

            const { startAt, endAt } = timeWindow;
            if ((rangeEnd == null || startAt < rangeEnd) && (rangeStart == null || endAt > rangeStart)) {
                tempMonthlyRankingList.push(tempMonthlyRanking);
                break;
            }
        }
    }
    return tempMonthlyRankingList;
}

// 按编号范围获取符合条件的月榜
export function getMonthlyRankingListByIdRange(rangeStart?: number, rangeEnd?: number) {
    const monthlyRankingIdList: Array<number> = Object.keys((mainAPI as any)['monthlyRanking'] ?? (mainAPI as any)['monthlyRankings'] ?? {}).map(Number);
    const tempMonthlyRankingList: Array<MonthlyRanking> = [];

    if (rangeStart == null && rangeEnd == null) {
        return tempMonthlyRankingList;
    }

    for (let i = 0; i < monthlyRankingIdList.length; i++) {
        const monthlyRankingId = monthlyRankingIdList[i];
        if ((rangeStart == null || monthlyRankingId >= rangeStart) && (rangeEnd == null || monthlyRankingId <= rangeEnd)) {
            const tempMonthlyRanking = new MonthlyRanking(monthlyRankingId);
            if (tempMonthlyRanking.isExist) {
                tempMonthlyRankingList.push(tempMonthlyRanking);
            }
        }
    }

    sortMonthlyRankingList(tempMonthlyRankingList)
    return tempMonthlyRankingList
}

function getMonthlyRankingTimeWindowByServer(monthlyRanking: MonthlyRanking, server: Server): { startAt: number, endAt: number } | null {
    const startAt = monthlyRanking.startAt[server];
    const endAt = monthlyRanking.endAt[server];
    if (startAt != null && endAt != null) {
        return { startAt, endAt };
    }
    return null;
}

// 获取当前进行中的月榜,如果期间没有月榜，则返回上一个刚结束的月榜
export function getPresentMonthlyRanking(server: Server, time?: number) {
    if (!time) {
        time = Date.now()
    }
    const monthlyRankingIdList: Array<number> = Object.keys((mainAPI as any)['monthlyRanking'] ?? (mainAPI as any)['monthlyRankings'] ?? {}).map(Number)
    let tempMonthlyRankingList: Array<number> = []
    for (const key of monthlyRankingIdList) {
        const monthlyRanking = new MonthlyRanking(key)
        if (monthlyRanking.startAt[server] != null && monthlyRanking.endAt[server] != null) {
            if (monthlyRanking.startAt[server] <= time && monthlyRanking.endAt[server] >= time) {
                tempMonthlyRankingList.push(key)
            }
        }
    }

    let monthlyRankingEndAtFlags:number = 0
    if (tempMonthlyRankingList.length == 0) {
        for (const key of monthlyRankingIdList) {
            const monthlyRanking = new MonthlyRanking(key)
            if (monthlyRanking.startAt[server] != null && monthlyRanking.endAt[server] != null) {
                if (monthlyRanking.endAt[server] <= time) {
                    if(monthlyRanking.endAt[server] > monthlyRankingEndAtFlags){
                        tempMonthlyRankingList.push(key)
                        monthlyRankingEndAtFlags = monthlyRanking.endAt[server]
                    }
                }
            }
        }
    }

    if (tempMonthlyRankingList.length == 0) {
        return null
    }

    return new MonthlyRanking(tempMonthlyRankingList[tempMonthlyRankingList.length - 1])
}

// 根据服务器，将月榜列表排序（正常按id排序即可）
export function sortMonthlyRankingList(tempMonthlyRankingList: MonthlyRanking[], displayedServerList: Server[] = globalDefaultServer) {
    tempMonthlyRankingList.sort((a, b) => a.monthlyRankingId - b.monthlyRankingId)
}

// 通过月榜与服务器，获得前5期月榜（不看类型）
export function getRecentMonthlyRankingListByMonthlyRankingAndServer(monthlyRanking: MonthlyRanking, server: Server, count: number) {
    const monthlyRankingIdList: Array<number> = Object.keys((mainAPI as any)['monthlyRanking'] ?? (mainAPI as any)['monthlyRankings'] ?? {}).map(Number)
    monthlyRankingIdList.sort((a, b) => a - b)

    const tempMonthlyRankingList: Array<MonthlyRanking> = []
    for (const monthlyRankingId of monthlyRankingIdList) {
        const tempMonthlyRanking = new MonthlyRanking(monthlyRankingId)
        if (tempMonthlyRanking.startAt[server] != null) {
            if (tempMonthlyRanking.startAt[server] > monthlyRanking.startAt[server]) {
                continue
            }
            tempMonthlyRankingList.push(tempMonthlyRanking)
        }
    }

    sortMonthlyRankingList(tempMonthlyRankingList, [server])
    return tempMonthlyRankingList.slice(tempMonthlyRankingList.length - count, tempMonthlyRankingList.length)
}
