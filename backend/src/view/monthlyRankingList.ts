import { MonthlyRanking } from '@/types/MonthlyRanking';
import { getIcon, Server } from '@/types/Server';
import { globalDefaultServer } from '@/config';
import { drawTitle } from '@/components/title';
import { drawDatablockHorizontal } from '@/components/dataBlock';
import { line } from '@/components/list';
import { resizeImage, stackImage, stackImageHorizontal } from '@/components/utils';
import { outputFinalBuffer } from '@/image/output';
import { Canvas, Image } from 'skia-canvas';
import { changeTimefomant } from '@/components/list/time';
import { drawTextWithImages } from '@/image/text';
import { drawDottedLine } from '@/image/dottedLine';

const maxHeight = 7000;

export const line2: Canvas = drawDottedLine({
    width: 30,
    height: maxHeight,
    startX: 5,
    startY: 0,
    endX: 15,
    endY: maxHeight - 5,
    radius: 2,
    gap: 10,
    color: '#a8a8a8',
});

// 绘制单个月榜在列表中的样式（类似 eventList 的 drawEventInList）
export async function drawMonthlyRankingInList(monthlyRanking: MonthlyRanking, displayedServerList: Server[] = globalDefaultServer): Promise<Canvas> {
    if (!monthlyRanking.isInitFull) await monthlyRanking.initFull(false);

    const textSize = 25 * 3 / 4;
    const content: Array<string | Canvas | Image> = [];

    // ID + 名称
    content.push(`ID: ${monthlyRanking.monthlyRankingId.toString()}\n`);

    for (let i = 0; i < displayedServerList.length; i++) {
        const server = displayedServerList[i];
        if (monthlyRanking.startAt[server] != null) {
            content.push(await getIcon(server), ` ${monthlyRanking.monthlyRankingName[server]}\n`);
            content.push(new Canvas(313,313), ` ${changeTimefomant(monthlyRanking.startAt[server])} - ${changeTimefomant(monthlyRanking.endAt[server])}\n`);
        }
    }

    // 基本属性文本转图片
    const textImage = drawTextWithImages({ content, textSize, maxWidth: 500 });

    // banner
    const bannerImage = resizeImage({ image: await monthlyRanking.getBannerImage(displayedServerList), heightMax: 100 });
    const imageUp = stackImageHorizontal([bannerImage, new Canvas(20, 1), textImage]);

    // 下方区域
    const imageDownList: Canvas[] = [];
/*
    // 歌曲
    if (monthlyRanking.bgmFileName) {
        const m = monthlyRanking.bgmFileName.match(/bgm(\d+)_/i);
        if (m) {
            const songId = parseInt(m[1], 10);
            const song = new Song(songId);
            if (song.isExist) {
                await song.initFull();
                imageDownList.push((await drawSongInList(song, undefined,"", displayedServerList)));
            }
        }
    }*/

    let imageDown: Canvas;
    if (imageDownList.length > 0) {
        imageDown = stackImage(imageDownList);
        return stackImage([imageUp, imageDown]);
    } else {
        return imageUp;
    }
}

export async function drawMonthlyRankingList(
    monthlyRankingList: MonthlyRanking[],
    displayedServerList: Server[] = globalDefaultServer,
    compress: boolean = false,
    useEasyBG: boolean,
): Promise<Array<Buffer | string>> {
    if (monthlyRankingList.length == 0) return ['没有搜索到符合条件的月榜'];

    for (const monthlyRanking of monthlyRankingList) {
        if (!monthlyRanking.isInitFull) await monthlyRanking.initFull();
    }

    const promises: Promise<{ index: number; image: Canvas }>[] = [];
    for (let i = 0; i < monthlyRankingList.length; i++) {
        promises.push(drawMonthlyRankingInList(monthlyRankingList[i], displayedServerList).then((image) => ({ index: i, image })));
    }

    const results = await Promise.all(promises);
    results.sort((a, b) => a.index - b.index);

    const canvases: Canvas[] = results.map((r) => r.image);

    // 切分为列（和 eventList 相同的输出策略）
    const eventImageListHorizontal: Canvas[] = [];
    let tempList: Canvas[] = [];
    let tempH = 0;
    for (let i = 0; i < canvases.length; i++) {
        const c = canvases[i];
        tempH += c.height;
        if (tempH > maxHeight) {
            if (tempList.length > 0) {
                eventImageListHorizontal.push(stackImage(tempList));
                eventImageListHorizontal.push(line2);
            }
            tempList = [];
            tempH = c.height;
        }
        tempList.push(c);
        tempList.push(line);
        if (i === canvases.length - 1) {
            eventImageListHorizontal.push(stackImage(tempList));
            eventImageListHorizontal.push(line2);
        }
    }

    eventImageListHorizontal.pop();

    if (eventImageListHorizontal.length > 7) {
        const out: Array<string | Buffer> = [];
        out.push('月榜列表过长，已经拆分输出');
        let times = 0;
        for (let i = 0; i < eventImageListHorizontal.length; i++) {
            const tempCanv = eventImageListHorizontal[i];
            if (tempCanv === line2) continue;
            const all: Array<Canvas> = [];
            if (times === 0) all.push(drawTitle('查询', '月榜列表'));
            all.push(tempCanv);
            const buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true });
            out.push(buffer);
            times += 1;
        }
        return out;
    } else {
        const all: Array<Canvas> = [];
        const image = drawDatablockHorizontal({ list: eventImageListHorizontal });
        all.push(drawTitle('查询', '月榜列表'));
        all.push(image);
        const buffer = await outputFinalBuffer({ imageList: all, useEasyBG, compress });
        return [buffer];
    }
}
