import { drawList, line } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock'
import { Image, Canvas } from 'skia-canvas'
import { changeTimefomant } from '@/components/list/time';
import { Server } from '@/types/Server';
import { drawTitle } from '@/components/title'
import { outputFinalBuffer } from '@/image/output'
import { serverNameFullList, tierListOfServer } from '@/config';
import { statusName } from '@/config';
import { MonthlyRanking } from "@/types/MonthlyRanking";
import { drawMonthlyRankingDatablock } from "@/components/dataBlock/monthlyRanking";
import { MonthlyRankingCutoff } from "@/types/MonthlyRankingCutoff";
import { drawMonthlyRankingCutoffChart } from "@/components/chart/monthlyRankingCutoffChart";

export async function drawMonthlyRankingCutoffAll(monthlyRankingId: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    const monthlyRanking = new MonthlyRanking(monthlyRankingId);
    if (!monthlyRanking.isExist) {
        return ['活动不存在']
    }
    if (monthlyRanking.startAt[mainServer] == undefined) {
        return ['活动在该服务器不存在']
    }
    const all = []
    all.push(drawTitle('档线列表', `${serverNameFullList[mainServer]}`))
    all.push(await drawMonthlyRankingDatablock(monthlyRanking, [mainServer]))

    const list: Array<Image | Canvas> = []

    //初始化档线列表
    const tierList = tierListOfServer[Server[mainServer]];
    const cutoffList: Array<MonthlyRankingCutoff> = [];
    for (const i in tierList) {
        const tempCutoff = new MonthlyRankingCutoff(monthlyRankingId, mainServer, tierList[i]);
        await tempCutoff.initFull();
        if (tempCutoff.status == 'in_progress') {
            tempCutoff.predict()
        }
        cutoffList.push(tempCutoff)
    }

    //状态
    list.push(drawList({
        key: '状态',
        text: statusName[cutoffList[0].status]
    }))

    list.push(line)
    //每个档线详细数据
    for (var i in cutoffList) {
        const cutoff = cutoffList[i]
        if (!cutoff.latestCutoff) continue
        let cutoffContent: string[] = []
        if (cutoff.status == 'in_progress') {
            let predictText: string
            if (cutoff.predictEP == null || cutoff.predictEP == 0) {
                predictText = '?'
            }
            else {
                predictText = cutoff.predictEP.toString()
            }
            cutoffContent.push(`当前预测线: ${predictText}\n`)
            cutoffContent.push(`最新分数线: ${cutoff.latestCutoff.ep.toString()}\n`)
            cutoffContent.push(`更新时间:${changeTimefomant(cutoff.latestCutoff.time)}\n`)
        }
        else if (cutoff.status == 'ended') {
            cutoffContent.push(`最终分数线:${cutoff.latestCutoff.ep.toString()}\n`)
        }


        list.push(drawList({
            key: `T${cutoff.tier}`,
            content: cutoffContent
        }))
        list.push(line)
    }
    list.pop()
    list.push(new Canvas(800, 50))

    //折线图
    list.push(await drawMonthlyRankingCutoffChart(cutoffList))

    //创建最终输出数组
    var listImage = drawDatablock({ list })

    all.push(listImage)
    /*
    all.push(drawTips({
        text: '想给我们提供数据?\n可以在群聊238052000中提供数据\n也可以通过扫描右侧二维码进行上传\n手机可以长按图片扫描二维码\n我们会尽快将数据上传至服务器',
        image: await loadImageFromPath(path.join(assetsRootPath, 'shimowendang.png'))
    }))
    */
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress,
    })
    return [buffer]
}
