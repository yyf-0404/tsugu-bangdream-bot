import { Canvas } from 'skia-canvas';
import { MonthlyRanking } from '@/types/MonthlyRanking';
import { drawBannerImageCanvas } from '@/components/dataBlock/utils';
import { drawDatablock } from '@/components/dataBlock';
import { drawList, drawListWithLine, line } from '@/components/list';
import { drawTimeInList } from '@/components/list/time';
import { Server } from '@/types/Server';
import { globalDefaultServer } from '@/config';

export async function drawMonthlyRankingDatablock(
    monthlyRanking: MonthlyRanking,
    displayedServerList: Server[] = globalDefaultServer,
    topLeftText?: string,
) {
    if (!monthlyRanking.isInitFull) {
        await monthlyRanking.initFull();
    }

    const list: Array<Canvas> = [];
    list.push(drawBannerImageCanvas(await monthlyRanking.getBannerImage(displayedServerList)));
    list.push(new Canvas(800, 30));
    const textImageList: Array<Canvas> = []

    // ID + 名称
    textImageList.push(drawList({
        text: `ID: ${monthlyRanking.monthlyRankingId.toString()} ${monthlyRanking.monthlyRankingName[displayedServerList[0]]}`,
    }));

    //活动时间
    textImageList.push(await drawTimeInList({
        content: monthlyRanking.startAt,
        eventId: monthlyRanking.monthlyRankingId,
    }, displayedServerList))

    // 基本属性文本转图片
    const textImageListImage = drawListWithLine(textImageList);
    list.push(textImageListImage);
    list.push(line);

    if (list.length > 0) {
        list.pop();
    }

    return drawDatablock({ list, topLeftText });
}
