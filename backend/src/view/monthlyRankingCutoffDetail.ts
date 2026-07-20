import { drawList, line, drawListMerge } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock';
import { Image, Canvas } from 'skia-canvas';
import { changeTimePeriodFormat } from '@/components/list/time';
import { Server } from '@/types/Server';
import { drawTitle } from '@/components/title';
import { outputFinalBuffer } from '@/image/output';
import { serverNameFullList, statusName } from '@/config';
import { MonthlyRankingCutoff } from '@/types/MonthlyRankingCutoff';
import { drawMonthlyRankingCutoffChart } from '@/components/chart/monthlyRankingCutoffChart';
import { drawMonthlyRankingDatablock } from '@/components/dataBlock/monthlyRanking';
import { drawMonthlyRankingCutoffEventTop } from '@/view/monthlyRankingCutoffEventTop';

export async function drawMonthlyRankingCutoffDetail(monthlyRankingId: number, tier: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    if (!tier) return ['请输入排名'];

    const cutoff = new MonthlyRankingCutoff(monthlyRankingId, mainServer, tier);
    if (cutoff.isExist == false) {
        return [`错误: ${ serverNameFullList[mainServer] } 月榜或档线不存在`];
    }
    await cutoff.initFull();
    if (!cutoff.latestCutoff) return [`错误: ${ serverNameFullList[mainServer] } 月榜或档线暂不存在`];

    if (tier == 10) {
        return await drawMonthlyRankingCutoffEventTop(monthlyRankingId, mainServer, compress);
    }

    const all: Array<Canvas | Image> = [];
    all.push(drawTitle('预测线', `${ serverNameFullList[mainServer] } 月榜 ${ cutoff.tier }档线`));
    const monthlyRankingBlock = await drawMonthlyRankingDatablock(cutoff.monthlyRanking, [mainServer]);
    all.push(monthlyRankingBlock);

    const list: Array<Image | Canvas> = [];
    const time = Date.now();

    if (cutoff.status == 'in_progress') {
        cutoff.predict();
        const predictText = cutoff.predictEP == null || cutoff.predictEP == 0 ? '?' : cutoff.predictEP.toString();
        const cutoffs = cutoff.cutoffs;
        const lastep = cutoffs.length > 1 ? cutoffs[cutoffs.length - 2].ep : 0;
        const timeSpan = (cutoffs.length > 1 ? cutoff.latestCutoff.time - cutoffs[cutoffs.length - 2].time : cutoff.latestCutoff.time - cutoff.startAt) / (1000 * 3600);
        let smoothRate = 0;
        if (cutoffs && cutoffs.length >= 2) {
            const lastPoint = cutoffs[cutoffs.length - 1];

            // 向前寻找大约 1 小时前（3600000 毫秒）的数据点
            const oneHourAgoTime = lastPoint.time - 3600000;
            let prevPoint = cutoffs[0];

            for (let i = cutoffs.length - 1; i >= 0; i--) {
                if (cutoffs[i].time <= oneHourAgoTime) {
                    prevPoint = cutoffs[i];
                    break;
                }
            }

            // 计算实际的时间差（小时）和分数差
            const dt = (lastPoint.time - prevPoint.time) / 3600000;
            if (dt > 0) {
                smoothRate = (lastPoint.ep - prevPoint.ep) / dt; // 单位：EP/小时
            }
        }
        list.push(drawListMerge([
            drawList({ key: '预测线', text: predictText }),
            drawList({ key: '当前时速', text: `${ Math.round((cutoff.latestCutoff.ep - lastep) / timeSpan) } pt/h` }),
            drawList({ key: '线性外推', text: cutoffs[cutoffs.length - 1] ? Math.round(cutoffs[cutoffs.length - 1].ep + smoothRate * ((cutoff.endAt - cutoffs[cutoffs.length - 1].time) / 3600000)).toString() : '无数据' })
        ]));
        list.push(line);

        const tempImageList = [];
        tempImageList.push(drawList({ key: '最新分数线', text: cutoff.latestCutoff.ep.toString() }));
        tempImageList.push(drawList({
            key: '更新时间',
            text: `${ changeTimePeriodFormat((Date.now()) - cutoff.latestCutoff.time) }前`
        }));
        tempImageList.push(drawList({ text: '' }));
        list.push(drawListMerge(tempImageList));
        list.push(line);

        const tempList = [];

        tempList.push(drawList({ key: '月榜剩余时间', text: `${ changeTimePeriodFormat(cutoff.endAt - time) }` }));
        list.push(drawListMerge(tempList));
        list.push(line);
    } else if (cutoff.status == 'ended') {
        list.push(drawList({ key: '状态', text: statusName[cutoff.status] }));
        list.push(line);
        list.push(drawList({ key: '最终分数线', text: cutoff.latestCutoff.ep.toString() }));
        list.push(line);
    } else {
        list.push(drawList({ key: '状态', text: statusName[cutoff.status] }));
        list.push(line);
        list.push(drawList({ key: '当前分数线', text: cutoff.latestCutoff.ep.toString() }));
        list.push(line);
    }

    if (list.length > 0) list.pop();
    list.push(new Canvas(800, 50));
    list.push(await drawMonthlyRankingCutoffChart([cutoff]));

    all.push(drawDatablock({ list }));
    const buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress });
    return [buffer];
}
