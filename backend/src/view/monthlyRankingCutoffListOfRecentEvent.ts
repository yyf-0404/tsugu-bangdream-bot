import { drawList, line } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock';
import { Image, Canvas } from 'skia-canvas';
import { changeTimefomant } from '@/components/list/time';
import { Server } from '@/types/Server';
import { drawTitle } from '@/components/title';
import { outputFinalBuffer } from '@/image/output';
import { serverNameFullList } from '@/config';
import { drawMonthlyRankingCutoffChart } from '@/components/chart/monthlyRankingCutoffChart';
import { drawMonthlyRankingDatablock } from '@/components/dataBlock/monthlyRanking';
import { MonthlyRankingCutoff } from '@/types/MonthlyRankingCutoff';
import { MonthlyRanking, getRecentMonthlyRankingListByMonthlyRankingAndServer } from '@/types/MonthlyRanking';

export async function drawMonthlyRankingCutoffListOfRecentEvent(monthlyRankingId: number, tier: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    const monthlyRanking = new MonthlyRanking(monthlyRankingId);
    if (!monthlyRanking.isExist) {
        return ['月榜不存在'];
    }
    if (monthlyRanking.startAt[mainServer] == undefined) {
        return ['月榜在该服务器不存在'];
    }

    const tempcutoff = new MonthlyRankingCutoff(monthlyRankingId, mainServer, tier);
    if (tempcutoff.isExist == false) {
        return [`错误: ${serverNameFullList[mainServer]} 月榜或档线不存在`];
    }

    const all: Array<Canvas | Image> = [];
    all.push(drawTitle('历史的档线对比', `${serverNameFullList[mainServer]} ${tier}档线`));
    all.push(await drawMonthlyRankingDatablock(monthlyRanking, [mainServer]));

    const list: Array<Image | Canvas> = [];
    const monthlyRankingList = getRecentMonthlyRankingListByMonthlyRankingAndServer(monthlyRanking, mainServer, 5);
    const cutoffList: Array<MonthlyRankingCutoff> = [];
    for (let i = monthlyRankingList.length - 1; i >= 0; i--) {
        const cutoff = new MonthlyRankingCutoff(monthlyRankingList[i].monthlyRankingId, mainServer, tier);
        await cutoff.initFull();
        cutoffList.push(cutoff);
    }

    for (const cutoff of cutoffList) {
        if (!cutoff.latestCutoff) continue;
        list.push(drawList({
            key: `ID:${cutoff.monthlyRankingId} ${cutoff.getMonthlyRankingName(mainServer)}`,
        }));

        const cutoffContent: Array<Canvas | Image | string> = [];
        if (cutoff.status == 'in_progress') {
            cutoff.predict();
            const predictText = cutoff.predictEP == null || cutoff.predictEP == 0 ? '?' : cutoff.predictEP.toString();
            cutoffContent.push(`当前预测线: ${predictText}\n`);
            cutoffContent.push(`最新分数线: ${cutoff.latestCutoff.ep.toString()}\n`);
            cutoffContent.push(`更新时间:${changeTimefomant(cutoff.latestCutoff.time)}\n`);
        } else if (cutoff.status == 'ended') {
            cutoffContent.push(`最终分数线: ${cutoff.latestCutoff.ep.toString()}\n`);
        } else {
            cutoffContent.push(`状态: 待开始\n`);
            cutoffContent.push(`当前分数线: ${cutoff.latestCutoff.ep.toString()}`);
        }

        list.push(drawList({ content: cutoffContent }));
        list.push(line);
    }

    if (list.length > 0) {
        list.pop();
    }
    list.push(new Canvas(800, 50));
    list.push(await drawMonthlyRankingCutoffChart(cutoffList, true, mainServer));

    all.push(drawDatablock({ list }));
    const buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress });
    return [buffer];
}
