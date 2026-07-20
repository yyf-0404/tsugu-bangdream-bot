import { Image, Canvas } from 'skia-canvas';
import { drawTitle } from '@/components/title';
import { serverNameFullList } from '@/config';
import { Server } from '@/types/Server';
import { drawDatablock } from '@/components/dataBlock';
import { outputFinalBuffer } from '@/image/output';
import { drawPlayerRankingInList } from '@/components/list/playerRanking';
import { drawTimeLineChart } from '@/components/chart_Timeline';
import { getPresetColor } from '@/types/Color';
import { MusicRankingCutoffTop } from '@/types/MusicRankingCutoff';
import { Song } from '@/types/Song';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawSongInList } from '@/components/list/song';

export async function drawMusicRankingCutoffTop(
    eventId: number,
    mainServer: Server,
    compress: boolean,
    musicId: number
): Promise<Array<Buffer | string>> {
    const musicRankingCutoffTop = new MusicRankingCutoffTop(eventId, mainServer, musicId);
    await musicRankingCutoffTop.initFull();
    if (!musicRankingCutoffTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 歌榜不存在或数据不足`];
    }

    const all: Array<Canvas | Image> = [];
    all.push(drawTitle('档线', `${serverNameFullList[mainServer]} 歌榜 10档线`));
    all.push(await drawEventDatablock(musicRankingCutoffTop.event, [mainServer]));
    all.push(drawDatablock({ list: [await drawSongInList(new Song(musicId))] }));

    const list: Array<Image | Canvas> = [];
    const userInRankings = musicRankingCutoffTop.getLatestRanking();
    for (let i = 0; i < userInRankings.length; i++) {
        const color = i % 2 == 0 ? 'white' : '#f1f1f1';
        const user = musicRankingCutoffTop.getUserByUid(userInRankings[i].uid);
        const playerRankingImage = await drawPlayerRankingInList(user, color, mainServer);
        if (playerRankingImage != undefined) {
            list.push(playerRankingImage);
        }
    }

    list.push(new Canvas(800, 50));
    list.push(await drawMusicRankingTopChart(musicRankingCutoffTop));

    all.push(drawDatablock({ list }));
    const buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress });
    return [buffer];
}

async function drawMusicRankingTopChart(cutoffTop: MusicRankingCutoffTop) {
    const allData = cutoffTop.getChartData();
    if (!allData) {
        return new Canvas(1, 1);
    }

    function removeBraces(text: string): string {
        return text.replace(/\[[^\]]*\]/g, '');
    }

    const datasets = [];
    let colorNumber = 0;
    for (const key in allData) {
        const tempColor = getPresetColor(colorNumber);
        datasets.push({
            label: removeBraces(cutoffTop.getUserNameById(Number(key)) ?? key),
            data: allData[key],
            borderWidth: 4,
            borderColor: [tempColor.getRGBA(1)],
            backgroundColor: [tempColor.getRGBA(0.2)],
            pointBackgroundColor: tempColor.getRGBA(0),
            pointBorderColor: tempColor.getRGBA(0),
            pointStyle: false,
            fill: false,
            stepped: true,
        });
        colorNumber++;
    }

    const data = { datasets };
    return await drawTimeLineChart({
        data,
        start: new Date(cutoffTop.startAt),
        end: new Date(cutoffTop.endAt),
        setYStartToZero: false,
        useSegmentDash: false,
    }, true);
}
