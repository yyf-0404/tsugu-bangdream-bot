import { MonthlyRanking } from '@/types/MonthlyRanking';
import { Server, getServerByName } from '@/types/Server';
import { globalDefaultServer, serverNameFullList } from '@/config';
import { drawTitle } from '@/components/title';
import { drawDatablock } from '@/components/dataBlock';
import { drawList, drawListByServerList, drawListMerge, line, drawListWithLine } from '@/components/list';
import { drawBannerImageCanvas } from '@/components/dataBlock/utils';
import { outputFinalBuffer } from '@/image/output';
import { Canvas, Image } from 'skia-canvas';
import { Song } from '@/types/Song';
import { drawSongInList } from '@/components/list/song';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawDegreeListInList } from '@/components/list/degreeList';
import { Degree } from '@/types/Degree';
import { getEventListByTimeRange } from '@/types/Event';
import { changeTimefomant } from "@/components/list/time";

async function buildMonthlyRankingDetailBlocks(monthlyRanking: MonthlyRanking, displayedServerList: Server[]) {
    const list: Array<Canvas | Image> = [];

    list.push(drawBannerImageCanvas(await monthlyRanking.getBannerImage(displayedServerList)));
    list.push(new Canvas(800, 30));

    list.push(await drawListByServerList(monthlyRanking.monthlyRankingName, '月榜名称', displayedServerList));
    list.push(line);

    // 基本信息：ID
    list.push(drawList({ key: 'ID', text: monthlyRanking.monthlyRankingId.toString() }));
    list.push(line);

    // 时间信息
    list.push(await drawListByServerList(monthlyRanking.startAt.map(changeTimefomant), '开始时间', displayedServerList));
    list.push(line);
    list.push(await drawListByServerList(monthlyRanking.endAt.map(changeTimefomant), '结束时间', displayedServerList));
    list.push(line);

    // 活动奖励
    const rankToShow = [1, 2, 3, 10, 20, 30];
    const rewardServer = displayedServerList[0];
    const degreeList = [] as Degree[];
    try {
        const rewardsForServer = (monthlyRanking.rewards && monthlyRanking.rewards[rewardServer]) ? monthlyRanking.rewards[rewardServer] : [] as any[];
        for (const r of rewardsForServer || []) {
            for (const rank of rankToShow) {
                if (r.fromRank != undefined && r.toRank != undefined && rank >= r.fromRank && rank <= r.toRank) {
                    if (r.rewardType == 'degree' && r.rewardId != undefined) {
                        degreeList.push(new Degree(r.rewardId));
                    }
                }
            }
        }
    } catch (e) {
        // ignore
    }
    if (degreeList.length > 0) {
        list.push(await drawDegreeListInList({ key: '活动奖励', degreeList, server: rewardServer, displayedServerList }));
        list.push(line);
    }

    // 月榜歌曲（尝试从 bgmFileName 解析 songId）
    if (monthlyRanking.bgmFileName) {
        const m = monthlyRanking.bgmFileName.match(/bgm(\d+)_/i);
        if (m) {
            const songId = parseInt(m[1], 10);
            const song = new Song(songId);
            if (song.isExist) {
                await song.initFull();
                list.push(drawList({ key: "月榜歌曲" }));
                list.push(await drawSongInList(song, undefined, "", displayedServerList));
            } else {
                list.push(drawList({ key: '月榜音乐', text: monthlyRanking.bgmFileName }));
            }
        } else {
            list.push(drawList({ key: '月榜音乐', text: monthlyRanking.bgmFileName }));
        }
    }

    const listImage = drawDatablock({ list })

    //最终输出数组
    const all = [];
    all.push(drawTitle('查询', '月榜'))

    all.push(listImage)

    // 相关活动：按显示服务器逐服查询
    const eventImageList: Canvas[] = []

    for (let i = 0; i < displayedServerList.length; i++) {
            const server = displayedServerList[i]
            if (monthlyRanking.startAt[server] == null || monthlyRanking.endAt[server] == null) {
                continue
            }
            const serverEvents = getEventListByTimeRange(
                monthlyRanking.startAt[server],
                monthlyRanking.endAt[server],
                [server]
            )
            if (!serverEvents || serverEvents.length == 0) continue

            for (let j = 0; j < serverEvents.length; j++) {
                const ev = serverEvents[j]
                try {
                    if (j == 0) {
                        eventImageList.push(await drawEventDatablock(ev, displayedServerList, `${serverNameFullList[server]}相关活动`))
                    } else {
                        eventImageList.push(await drawEventDatablock(ev))
                    }
                } catch (e) {
                    continue
                }
            }
        }
        for (let i = 0; i < eventImageList.length; i++) {
            all.push(eventImageList[i])
        }

    return all;
}

async function buildMonthlyRankingListBlocks(monthlyRankingList: MonthlyRanking[], displayedServerList: Server[]) {
    const list: Array<Canvas | Image> = [];
    for (const monthlyRanking of monthlyRankingList) {
        const nameBlock = await drawListByServerList(monthlyRanking.monthlyRankingName, '月榜名称', displayedServerList);
        const infoBlock = drawList({ key: 'ID', text: monthlyRanking.monthlyRankingId.toString() });

        const server = displayedServerList[0] ?? getServerByName('jp');
        const timeBlock = drawListMerge([
            drawList({ key: '开始', text: changeTimefomant(monthlyRanking.startAt[server]) }),
            drawList({ key: '结束', text: changeTimefomant(monthlyRanking.endAt[server]) }),
        ], 800, false, 'top', [400, 400]);

        list.push(drawListWithLine([nameBlock, infoBlock, timeBlock]));
        list.push(line);
    }
    if (list.length > 0) {
        list.pop();
    }
    return list;
}

export async function drawMonthlyRankingDetail(
    monthlyRankingId: number,
    displayedServerList: Server[] = globalDefaultServer,
    compress: boolean = false,
    useEasyBG: boolean,
): Promise<Array<Buffer | string>> {
    const monthlyRanking = new MonthlyRanking(monthlyRankingId);
    if (!monthlyRanking.isExist) {
        return ['错误: 月榜不存在'];
    }

    await monthlyRanking.initFull();

    const allBlocks = await buildMonthlyRankingDetailBlocks(monthlyRanking, displayedServerList);
    const buffer = await outputFinalBuffer({
        imageList: allBlocks,
        useEasyBG: useEasyBG,
        text: 'Monthly Ranking',
        compress,
    });

    return [buffer];
}

export async function drawMonthlyRankingList(
    monthlyRankingList: MonthlyRanking[],
    displayedServerList: Server[] = globalDefaultServer,
    compress: boolean = false,
    useEasyBG: boolean,
): Promise<Array<Buffer | string>> {
    if (monthlyRankingList.length == 0) {
        return ['没有搜索到符合条件的月榜'];
    }

    for (const monthlyRanking of monthlyRankingList) {
        if (!monthlyRanking.isInitFull) {
            await monthlyRanking.initFull();
        }
    }

    const blocks = await buildMonthlyRankingListBlocks(monthlyRankingList, displayedServerList);
    const image = drawDatablock({ list: blocks });
    const buffer = await outputFinalBuffer({
        imageList: [drawTitle('查询', '月榜列表'), image],
        useEasyBG: useEasyBG,
        text: 'Monthly Ranking',
        compress,
    });

    return [buffer];
}
