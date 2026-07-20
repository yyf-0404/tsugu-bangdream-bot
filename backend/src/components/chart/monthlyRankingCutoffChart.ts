import { Canvas, Image } from 'skia-canvas';
import { drawTimeLineChart } from '@/components/chart_Timeline';
import { getPresetColor } from '@/types/Color';
import { drawList } from '@/components/list';
import { stackImage } from '@/components/utils';
import { Server } from '@/types/Server';
import { MonthlyRankingCutoff, MonthlyRankingCutoffTop } from '@/types/MonthlyRankingCutoff';

export async function drawMonthlyRankingCutoffChart(cutoffList: MonthlyRankingCutoff[], setStartToZero = false, server: Server = Server['jp']) {
    const datasets = [];
    const time = Date.now();
    if (cutoffList.length == 0) {
        return new Canvas(1, 1);
    }

    const list = [];
    const onlyOne = cutoffList.length == 1;
    for (let i = 0; i < cutoffList.length; i++) {
        const tempColor = getPresetColor(i);
        const cutoff = cutoffList[i];
        const labelName = setStartToZero
            ? `[${ cutoff.monthlyRankingId }] ${ cutoff.getMonthlyRankingName(server) } T${ cutoff.tier }`
            : `T${ cutoff.tier }`;

        list.push(drawList({
            content: [tempColor.generateColorBlock(0.8), labelName],
            textSize: 20,
        }));

        datasets.push({
            label: labelName,
            data: cutoff.getChartData(setStartToZero),
            borderWidth: 2,
            borderColor: [tempColor.getRGBA(1)],
            backgroundColor: [tempColor.getRGBA(0.2)],
            pointBackgroundColor: tempColor.getRGBA(1),
            pointBorderColor: tempColor.getRGBA(1),
            fill: onlyOne,
        });
    }

    if (!setStartToZero) {
        if (time < cutoffList[0].endAt) {
            const tempColor = getPresetColor(0);
            datasets.push({
                label: '当前时间',
                borderColor: [tempColor.getRGBA(1)],
                backgroundColor: [tempColor.getRGBA(1)],
                data: [{ x: new Date(time), y: 0 }],
                fill: false,
                pointRadius: 10,
                pointHoverRadius: 15,
                showLine: false,
            });
        }
    }

    const all: Array<Canvas | Image> = [stackImage(list)];
    const data = { datasets };
    if (setStartToZero) {
        let longestTime = 0;
        for (let i = 0; i < cutoffList.length; i++) {
            const cutoff = cutoffList[i];
            if (cutoff.endAt - cutoff.startAt > longestTime) {
                longestTime = cutoff.endAt - cutoff.startAt;
            }
        }
        all.push(await drawTimeLineChart({
            data,
            start: new Date(0),
            end: new Date(longestTime),
            setStartToZero
        }) as Canvas);
        return stackImage(all);
    }

    all.push(await drawTimeLineChart({
        data,
        start: new Date(cutoffList[0].startAt),
        end: new Date(cutoffList[0].endAt),
        setStartToZero
    }) as Canvas);
    return stackImage(all);
}

export async function drawMonthlyRankingCutoffTopChart(monthlyRankingCutoffTop: MonthlyRankingCutoffTop, setStartToZero = false) {
    const datasets = [];
    if (monthlyRankingCutoffTop == undefined) {
        return new Canvas(1, 1);
    }
    const allData = monthlyRankingCutoffTop.getChartData();
    let colorNumber = 0;
    for (const key in allData) {
        const tempColor = getPresetColor(colorNumber);
        datasets.push({
            label: monthlyRankingCutoffTop.getUserNameById(Number(key))?.replace(/\[[^\]]*]/g, '') ?? key,
            data: allData[key],
            borderWidth: 4,
            borderColor: [tempColor.getRGBA(1)],
            backgroundColor: [tempColor.getRGBA(0.2)],
            pointBackgroundColor: tempColor.getRGBA(0),
            pointBorderColor: tempColor.getRGBA(0),
            pointStyle: false,
            fill: false,
        });
        colorNumber++;
    }
    const data = { datasets };
    return await drawTimeLineChart({
        data,
        start: new Date(monthlyRankingCutoffTop.startAt),
        end: new Date(monthlyRankingCutoffTop.endAt),
        setStartToZero
    }, true);
}

export async function drawMonthlyRankingCutOffTopSingleChart(monthlyRankingCutoffTop: MonthlyRankingCutoffTop, setStartToZero = false, playerUid: number, server: Server = Server['jp']){
    var datasets = []
    if (monthlyRankingCutoffTop == undefined) {
        return (new Canvas(1, 1))
    }
    var allData = monthlyRankingCutoffTop.getChartData()[playerUid];
    function removeBraces(text: string): string {
        var newText = text.replace(/\[[^\]]*\]/g, "");
        return newText;
    }
    let colorNumber = 0

    const tempColor = getPresetColor(colorNumber)
    datasets.push({
        label: removeBraces(monthlyRankingCutoffTop.getUserNameById(Number(playerUid))),
        data: allData,
        borderWidth: 4,
        borderColor: [tempColor.getRGBA(1)],
        backgroundColor: [tempColor.getRGBA(0.2)],
        pointBackgroundColor: tempColor.getRGBA(0),
        pointBorderColor: tempColor.getRGBA(0),
        pointStyle: false,
        fill: false
    })
    colorNumber++

    var data = { datasets: datasets }
    return await drawTimeLineChart({ data, start: new Date(monthlyRankingCutoffTop.startAt), end: new Date(monthlyRankingCutoffTop.endAt), setStartToZero }, true)
}
