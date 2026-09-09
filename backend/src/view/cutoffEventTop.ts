import { Image, Canvas } from 'skia-canvas'
import { drawTitle } from "@/components/title";
import { serverNameFullList } from "@/config";
import { CutoffEventTop } from "@/types/CutoffEventTop";
import { Event } from '@/types/Event';
import { Server } from "@/types/Server";
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawDatablock } from '@/components/dataBlock';
import { outputFinalBuffer } from '@/image/output';
import { drawPlayerRankingInList } from '@/components/list/playerRanking';
import {
    drawCutoffEventTopChart,
    drawCutOffEventTopSingleChart, drawSinglePointChart
} from '@/components/chart/cutoffChart';
import { songChartRouter } from '@/routers/songChart';
import { drawList, drawListMerge } from '@/components/list';
import { drawDottedLine } from '@/image/dottedLine';
import { resizeImage } from '@/components/utils';
import { stackImage } from '@/components/utils';
import { drawRoundedRectWithText } from "@/image/drawRect";
import { presetColorList } from "@/types/Color";
import { getRatingByPlayer, getTopRatingDuringTime } from '@/types/TopRanking';
export { getRatingByPlayer, getTopRatingDuringTime } from '@/types/TopRanking';

export async function drawCutoffEventTop(eventId: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull();
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    var all = [];
    all.push(drawTitle('档线', `${serverNameFullList[mainServer]} 10档线`));
    var list: Array<Image | Canvas> = [];
    var event = new Event(eventId);
    all.push(await drawEventDatablock(event, [mainServer]));

    //前十名片
    var userInRankings = cutoffEventTop.getLatestRanking();
    for (let i = 0; i < userInRankings.length; i++) {
        var color = i % 2 == 0 ? 'white' : '#f1f1f1';
        var user = cutoffEventTop.getUserByUid(userInRankings[i].uid);
        var playerRankingImage = await drawPlayerRankingInList(user, color, mainServer);
        if (playerRankingImage != undefined) {
            list.push(playerRankingImage);
        }
    }

    list.push(new Canvas(800, 50))

    //折线图
    list.push(await drawCutoffEventTopChart(cutoffEventTop, false, mainServer))

    var listImage = drawDatablock({ list });
    all.push(listImage);

    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress })

    return [buffer];
}

export async function drawTopRateDetail(eventId: number, playerId: number, tier: number, day: number, limit: string, maxCount: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    //if (cutoffEventTop.status != "in_progress") {
    //return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    //}
    const finalRanking = cutoffEventTop.getLatestRanking();
    if (day) {
        const targetDay = cutoffEventTop.startAt + (day - 1) * 24 * 3600 * 1000;
        if (targetDay < cutoffEventTop.startAt || targetDay > cutoffEventTop.endAt) {
            return [`错误: ${serverNameFullList[mainServer]} d${day}不在活动时间内`];
        }
        const dayStart = new Date(targetDay)
        dayStart.setHours(0);
        const dayStartAt = dayStart.getTime();
        const dayEnd = new Date(targetDay)
        dayEnd.setHours(24);
        const dayEndAt = dayEnd.getTime();
        cutoffEventTop.points = cutoffEventTop.points.filter(point => (point.time > dayStartAt && point.time < dayEndAt));
    }

    var all = [];
    const widthMax = 1000, line: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 5,
        startY: 15,
        endX: widthMax - 5,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    all.push(drawTitle('查岗', `${serverNameFullList[mainServer]}`));
    {
        const list: Array<Image | Canvas> = [];
        // var event = new Event(eventId);
        // all.push(await drawEventDatablock(event, [mainServer]));
        //名片
        var event = new Event(eventId);
        all.push(await drawEventDatablock(event, [mainServer]));
        //var userInRankings = cutoffEventTop.getLatestRanking();
        var userInRankings = finalRanking;
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            var playerRankingImage = await drawPlayerRankingInList(user, 'white', mainServer);
            if (playerRankingImage != undefined) {
                list.push(resizeImage({ image: playerRankingImage, widthMax }));
            }
        }
        if (list.length > 0) {
            all.push(drawDatablock({ list, maxWidth: widthMax }))
        } else
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId)
    //最近maxCount次分数变化
    {
        const list = [], imageList = []
        const { min, max } = parseLimit(limit);
        let count = 0
        if (!maxCount) {
            maxCount = 20
        }
        list.push(drawListMerge([drawList({ key: '时间' }), drawList({ key: '分数' }), drawList({ key: '时间' }), drawList({ key: '分数' })], widthMax))
        const halfLine: Canvas = drawDottedLine({
            width: widthMax / 2,
            height: 30,
            startX: 15,
            startY: 15,
            endX: widthMax / 2 - 15,
            endY: 15,
            radius: 2,
            gap: 10,
            color: "#a8a8a8"
        })
        for (let i = 0; i + 1 < playerRating.length; i += 1) {
            if (playerRating[i + 1].value == -1) {
                break
            }
            if (!day && count == maxCount) {
                break
            }
            // 分数变动且间隔合理(bd防炸)
            if ((playerRating[i].value != playerRating[i + 1].value) && (playerRating[i].time - playerRating[i + 1].time < 5 * 60 * 1000)) {
                const mid = new Date((playerRating[i + 1].time + playerRating[i].time) / 2),
                    score = playerRating[i].value - playerRating[i + 1].value
                if (score > max || score < min) continue;
                count += 1
                const timeImage = drawList({ text: `${mid.toTimeString().slice(0, 5)}` })
                const ctx = timeImage.getContext('2d')
                ctx.font = "18px old,Microsoft Yahei"
                ctx.fillText(`${mid.getMonth() + 1}.${mid.getDate()}`, 50, 13)
                imageList.push(drawListMerge([
                    timeImage,
                    drawList({ text: `${score}` })], widthMax / 2))
                // list.push(line)
            }
        }
        if (count == 0) {
            list.push(drawList({ text: '数据不足' }))
        } else {
            imageList.reverse()
            const leftImage = [], rightImage = []
            for (let i = 0; i < count + 1 >> 1; i += 1) {
                leftImage.push(imageList[i])
                leftImage.push(halfLine)
            }
            leftImage.pop()
            for (let i = count + 1 >> 1; i < count; i += 1) {
                rightImage.push(imageList[i])
                rightImage.push(halfLine)
            }
            if (count % 2 == 0)
                rightImage.pop()
            list.push(drawListMerge([stackImage(leftImage), stackImage(rightImage)], widthMax))
        }
        all.push(drawDatablock({ list, topLeftText: day ? `玩家于day${day}的分数变化` : `最近${maxCount}次分数变化` }))
    }
    //CP活cp情况统计
    const nowEvent = new Event(eventId);
    if (nowEvent.eventType === 'challenge' && !limit) {
        const cpLists = [];
        let multiPlayTimes = 0;
        let multiPlayCPs = 0;
        let challengePlayTimes = 0;
        let changeCPs = 0;

        const playerStartTime = nowEvent.startAt[mainServer]

        const extendedRating = day ? playerRating :
            [...playerRating.filter(item => item.time > playerStartTime), {
                time: playerStartTime + 1,
                value: -1
            }, {
                time: playerStartTime,
                value: 0
            }];


        //console.log(extendedRating.slice(-50))

        let livePoint = [];
        let cpPoints = []
        const avg = (arr: number[]) => arr.length ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0;
        for (let i = 0; i < extendedRating.length - 1; i++) {
            const current = extendedRating[i]
            if (current.value <= 0) continue

            let j = i + 1
            let crossedSeparator = false

            //寻找下一个有效的分数值
            while (j < extendedRating.length) {
                if (extendedRating[j].value === -1) {
                    crossedSeparator = true
                } else if (extendedRating.at(j - 1)?.time - extendedRating.at(j)?.time > 5 * 60 * 1000) {
                    crossedSeparator = true;
                    if (extendedRating[j].value >= 0) break;
                } else if (extendedRating[j].value >= 0) break
                j++
            }

            //越界保护
            if (j >= extendedRating.length) break
            //计算分数增量
            const next = extendedRating[j]
            const diff = current.value - next.value

            if (diff === 0) continue

            //跨越-1/bd炸了(出现中断点，需合理分配协力和清理cp)
            if (crossedSeparator) {
                const timesPerHour = 28
                const cpTimesPerHour = 30
                const avgLivePoints = (avg(livePoint.length > 50 ? livePoint.slice(-50) : livePoint) || avg(cpPoints.length > 50 ? cpPoints.slice(-50) : cpPoints) / 8 || 11000);
                const avgCPPoints = (avg(cpPoints.length > 50 ? cpPoints.slice(-50) : cpPoints) || avg(livePoint.length > 50 ? livePoint.slice(-50) : livePoint) * 8 || 85000);
                const crossHour = (current.time - next.time) / (1000 * 60 * 60)
                const sleepTime = crossHour > 21 - tier ? (crossHour / 8) + tier : 0
                const diffHour = crossHour - sleepTime;
                const multiPlaySpeed = avgLivePoints * timesPerHour;
                const cpPlaySpeed = avgCPPoints * cpTimesPerHour;
                /*
                计算配比
                若协力直线能直接到达目标pt，那么全当协力算
                若不是，直接按拉满算
                然后计算协力直线和cp直线交点的解
                 */
                const getMax = (livePoint: number[]) => {
                    let max = avgLivePoints;
                    for (let i2 = 0; i2 < livePoint.length; i2++) {
                        if (livePoint[i2] > max && livePoint[i2] / avgLivePoints < 1.5) {
                            max = livePoint[i2];
                        }
                    }
                    return max;
                }
                //判断能否达到线
                const reachable = getMax(livePoint) * (timesPerHour * diffHour + 8 / 3) > diff;
                if (reachable) {
                    multiPlayTimes += diffHour * timesPerHour;
                    const addCPs = Math.ceil(diff / avgLivePoints * Math.ceil(avgLivePoints / 20));
                    //const addCPs = Math.ceil(diff/20);
                    multiPlayCPs += addCPs;
                    changeCPs += addCPs;
                } else {
                    //计算交点
                    /*
                    (a是协力时速，b是cp时速，d是分差，t是总时间)
                    a * t_1 + b * t_2 = d
                    t_1 + t_2 = t
                    => a * t_1 + b * (t - t_1) = d
                    => (a - b) * t_1 + b * t = d
                    => t_1 = (d - b * t) / (a - b)
                    t_2 = t - t_1
                     */
                    const [a, b, d, t] = [multiPlaySpeed, cpPlaySpeed, diff, diffHour];
                    const t_1 = (d - b * t) / (a - b);
                    const t_2 = t - t_1;
                    multiPlayTimes += t_1 * timesPerHour;
                    const addCPs = Math.ceil(a * t_1 / avgLivePoints * Math.ceil(avgLivePoints / 20)) - t_2 * cpTimesPerHour * 1600;
                    multiPlayCPs += addCPs //Math.ceil(a * t_1 / 20);
                    changeCPs += addCPs //Math.ceil(a * t_1 / 20) - t_2 * timesPerHour * 1600;
                    /*console.log(
                      '开始时间 ', new Date(next.time).toLocaleString(),
                      '\n结束时间 ', new Date(current.time).toLocaleString(),
                      '\navgLivePoints ',avgLivePoints,
                      '\navgCPPoints ', avgCPPoints,
                      '\naddMultiPlayHour ', t_1,
                      '\naddCPPlayHour ', t_2,
                      '\nmultiPlaySpeed ',multiPlaySpeed,
                      '\ncpPlaySpeed ',cpPlaySpeed,
                      '\n+ ',t_1 * a / 20,
                      '\n- ',t_2 * 26 * 1600,
                      '\ncpPoints', cpPoints,
                      '\nlivePoint', livePoint,
                      '\n-----------------------------')*/
                }
            } else if (diff > 50000 && diff < 110000) {
                challengePlayTimes += 1;
                changeCPs -= 1600;
                cpPoints.push(diff)
            } else {
                //记录一把分数
                if (diff > 8000 && diff < 20000)
                    livePoint.push(diff)
                multiPlayTimes += 1;
                const addCPs = Math.ceil(diff / 20);
                multiPlayCPs += addCPs;
                changeCPs += addCPs;
            }

            // 跳到下一个有效 pair（防止重复处理）
            i = j - 1
        }

        cpLists.push(drawListMerge([
            drawList({ text: '估计协力次数' }),
            drawList({ text: `${Math.floor(multiPlayTimes)}` })
        ], widthMax))
        cpLists.push(line)
        cpLists.push(drawListMerge([
            drawList({ text: '估计协力CP' }),
            drawList({ text: `${Math.floor(multiPlayCPs)}` })
        ], widthMax));
        cpLists.push(line)
        const avgLivePoints = Math.floor(avg(livePoint.length > 50 ? livePoint.slice(0, 50) : livePoint));
        const avgCPPoints = Math.floor(avg(cpPoints.length > 50 ? cpPoints.slice(0, 50) : cpPoints));
        cpLists.push(drawListMerge([
            drawList({ text: '把均pt(协力/CP)' }),
            drawList({ text: `${Math.floor(avg(livePoint))} / ${Math.floor(avg(cpPoints))}` })
        ], widthMax));
        cpLists.push(line)
        cpLists.push(drawListMerge([
            drawList({ text: '把均pt(近50把)' }),
            drawList({ text: `${avgLivePoints} / ${avgCPPoints}` })
        ], widthMax))
        cpLists.push(line)
        cpLists.push(drawListMerge([
            drawList({ text: '估计清CP次数' }),
            drawList({ text: `${Math.floor(challengePlayTimes)}` })
        ], widthMax))
        cpLists.push(line)
        cpLists.push(drawListMerge([
            drawList({ text: '估计CP积累' }),
            drawList({ text: `${Math.floor(changeCPs)}` })
        ], widthMax))
        all.push(drawDatablock({ list: cpLists, topLeftText: `CP追踪` }))
    }

    //近期统计数据
    const timeList = [1, 3, 12, 24]
    {
        const list = [], now = Date.now()
        list.push(drawListMerge([drawList({ key: '时间' }), drawList({ key: '分数变动次数' }), drawList({ key: '平均时间间隔' }), drawList({ key: '平均分数' })], widthMax))
        for (const a of timeList) {
            const begin = now - a * 60 * 60 * 1000
            const st = new Date(begin), ed = new Date(now)
            const timeImage = drawList({ text: `${st.toTimeString().slice(0, 5)}~${ed.toTimeString().slice(0, 5)}` })
            const offset = Math.floor((now / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60) - Math.floor((begin / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60)
            // console.log(st.getTimezoneOffset())
            if (offset > 0) {
                const ctx = timeImage.getContext('2d')
                ctx.font = "18px old,Microsoft Yahei"
                ctx.fillText(`-${offset}`, 30, 13)
            }
            let flag = 0, count = 0, sumScore = 0, timestamps = []
            for (let i = 0; i + 1 < playerRating.length; i += 1) {
                if (playerRating[i + 1].value == -1) {
                    flag = 1
                    break
                }
                if (playerRating[i].value != playerRating[i + 1].value) {
                    timestamps.push(playerRating[i].time)
                    if (playerRating[i + 1].time < begin)
                        break
                    count += 1
                    sumScore += playerRating[i].value - playerRating[i + 1].value
                }
                if (playerRating[i + 1].time < begin)
                    break
            }
            if (flag) {
                list.push(drawListMerge([timeImage, drawList({ text: '数据不足' })], widthMax))
            } else {
                const averageTime = getAverageTime(timestamps)
                list.push(drawListMerge([timeImage, drawList({ text: `${count}` }), drawList({ text: timestamps.length <= 1 ? '-' : `${(new Date(averageTime)).toTimeString().slice(3, 8)}` }), drawList({ text: count == 0 ? '-' : `${Math.floor(sumScore / count)}` })], widthMax))
            }
            list.push(line)
        }
        list.pop()
        all.push(drawDatablock({ list, topLeftText: `近期统计数据` }))
    }


    // list.push(new Canvas(800, 50))

    // //折线图
    // list.push(await drawCutoffEventTopChart(cutoffEventTop, false, mainServer))

    // var listImage = drawDatablock({ list });
    // all.push(listImage);

    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress })

    return [buffer];
}

//睡眠时间监测
export async function drawTopSleepStat(eventId: number, playerId: number, tier: number, mainServer: Server, time: number, compress: boolean) {
    var event = new Event(eventId);
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} ${eventId} 活动不存在或数据不足`];
    }
    //if (cutoffEventTop.status != "in_progress") {
    //return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    //}

    var all = [];
    const widthMax = 1000, line: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 5,
        startY: 15,
        endX: widthMax - 5,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    all.push(drawTitle('查睡眠', `${serverNameFullList[mainServer]}`));
    {
        const list: Array<Image | Canvas> = [];
        //名片
        var userInRankings = cutoffEventTop.getLatestRanking();
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            var playerRankingImage = await drawPlayerRankingInList(user, 'white', mainServer);
            if (playerRankingImage != undefined) {
                list.push(resizeImage({ image: playerRankingImage, widthMax }));
            }
        }
        if (list.length > 0) {
            all.push(drawDatablock({ list, maxWidth: widthMax }))
        } else
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId).filter(item => item.time < event.endAt[mainServer])
    const list = [];
    list.push(drawListMerge([drawList({ key: '日期' }), drawList({ key: '休息时段' }), drawList({ key: '休息时长' })], widthMax));
    const sleep: { start: number; end: number }[] = []
    const limitTime = (time || 25) * 60 * 1000;
    let tmpTime = -1;
    let tmpValue = 0;
    for (let i = playerRating.length - 1; i >= 0; i--) {
        if (playerRating[i].value <= 0) {
            tmpTime = -1;
            tmpValue = 0;
            continue;
        }
        if (playerRating[i].value === tmpValue && i > 0) continue;
        else if ((tmpTime === -1 && (playerRating[i].value >= 0)) ||
            // bd防炸
            (playerRating.at(i).time - playerRating.at(i + 1).time > 5 * 60 * 1000))
            [tmpTime, tmpValue] = [playerRating[i].time, playerRating[i].value];
        else {
            if (playerRating[i].time - tmpTime > limitTime) {
                sleep.push({ start: tmpTime, end: playerRating[i].time });
            }
            [tmpTime, tmpValue] = [playerRating[i].time, playerRating[i].value];
        }
    }
    let totalSleepTime = 0;
    const toTimeStr = (time: number) => `${Math.floor(time / 60) > 0 ? `${Math.floor(time / 60)}h` : ''}${time % 60}min`
    if (sleep.length > 0) {

        for (const { start, end } of sleep) {
            const st = new Date(start), ed = new Date(end)
            const timeImage = drawList({ text: `${st.toTimeString().slice(0, 5)}~${ed.toTimeString().slice(0, 5)}` })
            const offset = Math.floor((ed.getTime() / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60) - Math.floor((st.getTime() / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60)
            // console.log(st.getTimezoneOffset())
            if (offset > 0) {
                const ctx = timeImage.getContext('2d')
                ctx.font = "18px old,Microsoft Yahei"
                ctx.fillText(`-${offset}`, 30, 13)
            }
            const diff = Math.floor((end - start) / (1000 * 60));
            totalSleepTime += end - start;
            const formatDate = (date) => {
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${month}/${day}`;
            };

            list.push(drawListMerge([
                drawList({ text: `${formatDate(ed)}` }),
                timeImage,
                drawList({ text: toTimeStr(diff) })
            ], widthMax))
            list.push(line)
        }
        const nowEvent = new Event(eventId);
        list.push(line)
        list.push(drawListMerge([
            drawList({ text: '总计: ' }),
            drawList({ text: toTimeStr(Math.floor(totalSleepTime / (1000 * 60))) }),
            drawList({ text: '平均每天: ' }),
            drawList({ text: toTimeStr(Math.floor(24 * 60 * totalSleepTime / (playerRating[0].time - nowEvent.startAt[mainServer]))) })
        ], widthMax))
    } else {
        list.push(drawListMerge([drawList({ text: '数据不足' })], widthMax))
    }
    //折线图
    list.push(await drawCutOffEventTopSingleChart(cutoffEventTop, false, playerId, mainServer))
    all.push(drawDatablock({ list, topLeftText: `休息时间统计` }))

    all.push(await drawEventDatablock(event, [mainServer]));
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress })

    return [buffer];
}

export async function drawTopRateRanking(eventId: number, mainServer: Server, compress: boolean, time: number, date: Date, compareTier: number, comparePlayerUid: number) {
    const cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    if (!date && cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    if (compareTier && !(Number.isInteger(compareTier) && compareTier >= 1 && compareTier <= 10)) {
        return [`错误: 档位${compareTier}不存在`]
    }
    if (date && (date.getTime() < cutoffEventTop.startAt || date.getTime() > cutoffEventTop.endAt)) {
        return [`错误: ${date.toLocaleString()}不在当前活动时间内`]
    }

    const all = [];
    const widthMax = 3000;

    let list = []
    const top10SpeedRankingData = getTopRatingDuringTime(cutoffEventTop, time, date, compareTier, comparePlayerUid);
    if (!top10SpeedRankingData.length) return ['错误: 在指定时间未找到有效的排名数据'];
    if (compareTier && !top10SpeedRankingData[compareTier - 1]) return [`错误: 档位${compareTier}不存在`];
    const compareName = compareTier ? top10SpeedRankingData[compareTier - 1].name : (comparePlayerUid ? cutoffEventTop.getUserNameById(comparePlayerUid) : null);
    const headerStringArray = ['排名', 'uid', 'id', '分数', '分差', compareName ? `与${compareName}分差` : null, `${time}min分数变化`, '速度排名', '分数变动次数', '前空白', '尾空白', '把均pt', '当前数据获取时间', '上次数据获取时间']
    //const headerStringArray = ['順位', 'uid', 'id', 'ポイント', '上との差', compareName ? `${compareName}さんと差` : null, `${time}時速`, '時速ランキング', '今の時間', '1hスタート時間']
    const top10RankingTable: Canvas[][] = top10SpeedRankingData.map(() => []);
    const drawWidth = []
    const header: Canvas[] = [];
    headerStringArray.forEach((value, index) => {
        if (!value) return header.push(null);
        header.push(drawRoundedRectWithText({ text: value, textSize: 30 }))
    })
    //对每一个字段进行遍历
    Object.keys(top10SpeedRankingData[0]).forEach((value, index) => {
        //若未指定玩家那么直接跳过
        if (!header[index]) return;
        //存储宽度
        const width = [];
        const height = [];
        //对每一个排名进行遍历
        for (let i = 0; i < top10SpeedRankingData.length; i++) {
            //绘制字段图并存储各个宽度
            const img = drawList({ text: String(top10SpeedRankingData[i][value] ?? '---') });
            width.push(img.width);
            height.push(img.height);
            top10RankingTable[i].push(img);
        }
        const maxWid = Math.max(header[index].width, ...width);
        drawWidth.push(maxWid + 20);
    })
    const totalWidth = drawWidth.reduce((sum, w) => sum + w, 0);
    const line: Canvas = drawDottedLine({
        width: totalWidth,
        height: 30,
        startX: 5,
        startY: 15,
        endX: totalWidth - 5,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    all.push(drawTitle('t10时速排名', `${serverNameFullList[mainServer]}`));
    list.push(drawListMerge(header.filter(Boolean), widthMax, false, "top", drawWidth))
    top10RankingTable.forEach((row) => {
        list.push(line)
        list.push(drawListMerge(row, widthMax, true, "top", drawWidth))
    })

    all.push(drawDatablock({ list }));
    var event = new Event(eventId);
    all.push(await drawEventDatablock(event, [mainServer]));

    let buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress })
    return [buffer];
}

export async function drawTopTenMinuteSpeed(eventId: number, mainServer: Server, compress: boolean = false, date: Date, time = 60, allPlayer = false) {
    const cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);

    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    if (!date && cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    if (date && (date.getTime() < cutoffEventTop.startAt || date.getTime() > cutoffEventTop.endAt)) {
        return [`错误: ${date.toLocaleString()}不在当前活动时间内`]
    }

    const all = [];
    const widthMax = 3000;
    all.push(drawTitle('分速表', `${serverNameFullList[mainServer]}`));

    const targetTime = date ? date.getTime() : Date.now();
    const startTimeLimit = targetTime - (time * 60 * 1000);

    const allPointsInRange = cutoffEventTop.points.filter(p => p.time >= startTimeLimit && p.time <= targetTime);
    const displayTimeStamps = Array.from(new Set(allPointsInRange.map(p => p.time))).sort((a, b) => a - b);

    const bufferTime = startTimeLimit - (30 * 60 * 1000);
    const calculationSource = cutoffEventTop.points.filter(p => p.time >= bufferTime && p.time <= targetTime);

    let targetUids: number[];
    let rankingMap = new Map<number, number>();

    let topTenUids = new Set<number>();
    const currentRanking = cutoffEventTop.getRankingAt(targetTime);
    topTenUids = new Set(currentRanking.map(r => r.uid));

    if (allPlayer) {
        // 获取时间范围内所有出现过的玩家
        targetUids = Array.from(new Set(allPointsInRange.map(p => p.uid)));
        targetUids.forEach(uid => {
            const userPoints = allPointsInRange
                .filter(p => p.uid === uid)
                .sort((a, b) => b.time - a.time);
            rankingMap.set(uid, userPoints.length > 0 ? userPoints[0].value : 0);
        });
        // 根据最后一次分数降序排列
        targetUids.sort((a, b) => (rankingMap.get(b) || 0) - (rankingMap.get(a) || 0));
    } else {
        targetUids = Array.from(topTenUids);
        currentRanking.forEach(r => rankingMap.set(r.uid, r.value));
        targetUids = currentRanking.map(r => r.uid);
    }

    if (targetUids.length === 0) {
        return [`错误: 在指定时间未找到有效的排名数据`];
    }

    const players = [];
    for (const uid of targetUids) {
        const point = rankingMap.get(uid) || 0;
        const name = cutoffEventTop.getUserNameById(uid);
        const playerRating = getRatingByPlayer(calculationSource, uid);

        const speeds: string[] = [];
        displayTimeStamps.forEach(currentTime => {
            const currentIdx = playerRating.findIndex(r => r.time === currentTime);
            if (currentIdx === -1 || playerRating[currentIdx].value < 0) {
                speeds.push("---");
                return;
            }

            const current = playerRating[currentIdx];
            let prevValidPoint = null;
            let isGap = false;

            for (let k = currentIdx + 1; k < playerRating.length; k++) {
                if (playerRating[k].value >= 0) {
                    prevValidPoint = playerRating[k];
                    if (k > currentIdx + 1) isGap = true;
                    break;
                }
            }

            if (prevValidPoint) {
                const diff = current.value - prevValidPoint.value;
                const finalDiff = diff < 0 ? 0 : diff;
                speeds.push(isGap ? `(+${finalDiff})` : String(finalDiff));
            } else {
                speeds.push("---");
            }
        });
        // 额外记录 UID 用于后续判断括号
        players.push({ uid, name, currentPt: point, speeds });
    }

    const rooms = identifyRooms(players, 0.9);
    const colorMap = new Map<string, string>();
    rooms.forEach((room, index) => {
        const c = presetColorList[index % presetColorList.length];
        const colorStr = `rgb(${c.r},${c.g},${c.b})`;
        room.forEach(playerName => colorMap.set(playerName, colorStr));
    });

    // 名字表头
    const headerStringArray = ['时间', ...players.map(p => p.name)];
    const header: Canvas[] = headerStringArray.map((text, idx) => {
        const playerName = idx === 0 ? null : players[idx - 1].name;
        const color = colorMap.get(playerName) || '#505050';
        return drawList({ text, textSize: 30, color, autoWrap: true, maxWidth: 250 });
    });

    // 分数行，榜外玩家加括号
    const ptRow: Canvas[] = [drawList({ text: (date ?? new Date()).toLocaleDateString() })];
    players.forEach(p => {
        // 如果开启了 allPlayer 且该玩家不在 Top 10 集合中，则加括号
        const showBracket = allPlayer && !topTenUids.has(p.uid);
        const ptText = showBracket ? `(${p.currentPt})` : String(p.currentPt);
        ptRow.push(drawList({ text: ptText }));
    });

    const tableRows: Canvas[][] = [];
    let colWidths: number[] = new Array(players.length + 1).fill(0);
    header.forEach((c, idx) => colWidths[idx] = Math.max(colWidths[idx], c.width));
    ptRow.forEach((c, idx) => colWidths[idx] = Math.max(colWidths[idx], c.width));

    for (let tIdx = displayTimeStamps.length - 1; tIdx >= 0; tIdx--) {
        const row: Canvas[] = [];
        const timeStr = new Date(displayTimeStamps[tIdx]).toTimeString().slice(0, 8);
        const timeImg = drawList({ text: timeStr });
        row.push(timeImg);
        colWidths[0] = Math.max(colWidths[0], timeImg.width);

        players.forEach((player, pIdx) => {
            const val = player.speeds[tIdx] ?? "---";
            const playerColor = colorMap.get(player.name) || '#505050';
            const speedImg = drawList({ text: val, color:  val == 0 || val == "---" ? "#CCCCCC" : playerColor });
            row.push(speedImg);
            colWidths[pIdx + 1] = Math.max(colWidths[pIdx + 1], speedImg.width);
        });
        tableRows.push(row);
    }

    const finalDrawWidth = colWidths.map(w => Math.max(...colWidths) + 20);
    const totalWidth = finalDrawWidth.reduce((a, b) => a + b, 0);
    const line = drawDottedLine({
        width: totalWidth, height: 30, startX: 5, startY: 15, endX: totalWidth - 5, endY: 15, radius: 2, gap: 10, color: "#a8a8a8"
    });

    let list = [];
    list.push(drawListMerge(header, widthMax, false, "center", finalDrawWidth));
    list.push(line);
    list.push(drawListMerge(ptRow, widthMax, true, "top", finalDrawWidth));
    list.push(line);
    list.push(line);

    tableRows.forEach(row => {
        list.push(drawListMerge(row, widthMax, true, "top", finalDrawWidth));
        list.push(line);
    });

    all.push(drawDatablock({ list }));
    all.push(await drawEventDatablock(new Event(eventId), [mainServer]));

    const buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress });
    return [buffer];
}

export async function drawTopRunningStatus(eventId: number, playerId: number, tier: number, mainServer: Server, time: number, compress: boolean) {
    var event = new Event(eventId);
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} ${eventId} 活动不存在或数据不足`];
    }
    //if (cutoffEventTop.status != "in_progress") {
    //return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    //}

    var all = [];
    const widthMax = 1000, line: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 5,
        startY: 15,
        endX: widthMax - 5,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    all.push(drawTitle('查稼动', `${serverNameFullList[mainServer]}`));
    {
        const list: Array<Image | Canvas> = [];
        //名片
        var userInRankings = cutoffEventTop.getLatestRanking();
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            var playerRankingImage = await drawPlayerRankingInList(user, 'white', mainServer);
            if (playerRankingImage != undefined) {
                list.push(resizeImage({ image: playerRankingImage, widthMax }));
            }
        }
        if (list.length > 0) {
            all.push(drawDatablock({ list, maxWidth: widthMax }))
        } else
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId).filter(item => item.time < event.endAt[mainServer])
    const list = [];
    list.push(drawListMerge([
        drawList({ key: '日期' }),
        drawList({ key: '稼动时间' }),
        drawList({ key: '稼动把数' }),
        drawList({ key: '把均pt' }),
        drawList({ key: '稼动总pt' })
    ], widthMax));
    //const run: {start: number; end: number; type: 'stop'|'unknown'|'running'}[] = []
    const limitTime = (time || 25) * 60 * 1000;
    const run: { startTime: number, startValue: number, endTime: number, endValue: number, playTimes: number }[] = [];
    let startTime: number | null = null;
    let startValue: number | null = null;
    let lastValue: number | null = null;
    let tmpTimes: number = 0;
    let lastActiveTime: number | null = null;
    let flag = false;
    for (let i = playerRating.length - 1; i >= 0; i--) {
        const { time, value } = playerRating[i];
        if (value === -1 || i === 0) {
            if (flag) {
                if (tmpTimes > 0)
                    run.push({
                        startTime, startValue, endTime: lastActiveTime, endValue: lastValue, playTimes: tmpTimes
                    })
                startTime = null;
                startValue = null;
                lastValue = null;
                tmpTimes = 0;
                lastActiveTime = null;
                flag = false;
            }
            continue;
        }
        if (value === lastValue) continue;
        if (value !== lastValue) {
            if (!flag) {
                startTime = time;
                startValue = value;
                tmpTimes = -1;
            } else
                //检查停车时间
            if (time - lastActiveTime > limitTime) {
                if (tmpTimes > 0)
                    run.push({
                        startTime, startValue, endTime: lastActiveTime, endValue: lastValue, playTimes: tmpTimes
                    })
                //检测bd防炸
                startTime = time;
                startValue = time - playerRating[i + 1]?.time > 5 * 60 * 1000 ? value : lastValue;
                tmpTimes = 0;
            }
            tmpTimes++;
            lastValue = value;
            lastActiveTime = time;
            flag = true;
        }
    }

    const toTimeStr = (time: number) => `${Math.floor(time / 60) > 0 ? `${Math.floor(time / 60)}h` : ''}${time % 60}min`
    if (run.length > 0) {
        let totalRunTime = 0;
        for (const { startTime, startValue, endTime, endValue, playTimes } of run) {
            const st = new Date(startTime), ed = new Date(endTime)
            const timeImage = drawList({ text: `${st.toTimeString().slice(0, 5)}~${ed.toTimeString().slice(0, 5)}` })
            const offset = Math.floor((ed.getTime() / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60) - Math.floor((st.getTime() / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60)
            if (offset > 0) {
                const ctx = timeImage.getContext('2d')
                ctx.font = "18px old,Microsoft Yahei"
                ctx.fillText(`-${offset}`, 30, 13)
            }
            const diff = Math.floor((endTime - startTime) / (1000 * 60));
            totalRunTime += endTime - startTime;
            const formatDate = (date) => {
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${month}/${day}`;
            };

            list.push(drawListMerge([
                drawList({ text: `${formatDate(ed)}` }),
                timeImage,
                drawList({ text: String(playTimes) }),
                drawList({ text: String(Math.floor((endValue - startValue) / playTimes)) }),
                drawList({ text: String(endValue - startValue) })
            ], widthMax, false, "top", [widthMax * 0.15, widthMax * 0.3, widthMax * 0.15, widthMax * 0.15, widthMax * 0.25]))
            list.push(line)
        }
        const nowEvent = new Event(eventId);
        list.push(line)
        list.push(drawListMerge([
            drawList({ text: '总计: ' }),
            drawList({ text: toTimeStr(Math.floor(totalRunTime / (1000 * 60))) }),
            drawList({ text: '平均每天: ' }),
            drawList({ text: toTimeStr(Math.floor(24 * 60 * totalRunTime / (playerRating[0].time - nowEvent.startAt[mainServer]))) })
        ], widthMax))
    } else {
        list.push(drawListMerge([drawList({ text: '数据不足' })], widthMax))
    }
    //折线图
    list.push(await drawCutOffEventTopSingleChart(cutoffEventTop, false, playerId, mainServer))
    all.push(drawDatablock({ list, topLeftText: `稼动时间统计` }))


    all.push(await drawEventDatablock(event, [mainServer]));
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress })

    return [buffer];
}

export async function drawTopPointStat(eventId: number, playerId: number, tier: number, limit: string, mainServer: Server, compress: boolean) {

    var event = new Event(eventId);
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${ serverNameFullList[mainServer] } ${ eventId } 活动不存在或数据不足`];
    }

    var all = [];
    const widthMax = 1000, line: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 5,
        startY: 15,
        endX: widthMax - 5,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    all.push(drawTitle('分数图', `${ serverNameFullList[mainServer] }`));
    {
        const list: Array<Image | Canvas> = [];
        //名片
        var userInRankings = cutoffEventTop.getLatestRanking();
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            var playerRankingImage = await drawPlayerRankingInList(user, 'white', mainServer);
            if (playerRankingImage != undefined) {
                list.push(resizeImage({ image: playerRankingImage, widthMax }));
            }
        }
        if (list.length > 0) {
            all.push(drawDatablock({ list, maxWidth: widthMax }))
        } else
            return [`玩家当前不在${ serverNameFullList[mainServer] }: 活动${ eventId }前十名里`]
    }
    all.push(drawDatablock({
        list: [await drawSinglePointChart(cutoffEventTop, playerId, limit)],
        topLeftText: `分数变动散点图`,
        maxWidth: widthMax
    }))

    // 3. 数据分析统计块
    {
        const statList = [];
        // 获取筛选后的差值数据
        const diffsData = getSinglePlayDiffs(cutoffEventTop.points, playerId, limit);
        const diffs = diffsData.map(d => d.value);

        if (diffs.length > 0) {
            // --- 统计学特征计算 ---
            const count = diffs.length;
            const avg = diffs.reduce((a, b) => a + b, 0) / count;
            const sorted = [...diffs].sort((a, b) => a - b);
            const median = count % 2 !== 0 ? sorted[Math.floor(count / 2)] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;

            // 标准差 (稳定性)
            const stdDev = Math.sqrt(diffs.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / count);

            // 众数计算
            const counts = new Map();
            let maxFreq = 0;
            diffs.forEach(x => {
                const f = (counts.get(x) || 0) + 1;
                counts.set(x, f);
                if (f > maxFreq) maxFreq = f;
            });
            const modes = Array.from(counts.entries()).filter(([_, f]) => f === maxFreq).map(([v]) => v);

            // --- 绘制列表内容 ---
            const addRow = (key: string, value: string) => {
                statList.push(drawListMerge([drawList({ text: key }), drawList({ text: value })], widthMax));
                statList.push(line);
            };

            addRow('样本总数', `${count} 把`);
            addRow('分数区间', `${sorted[0]} ~ ${sorted[count - 1]}`);
            addRow('平均出分 (Mean)', `${avg.toFixed(1)}`);
            addRow('中位数 (Median)', `${median}`);
            addRow('出分众数 (Mode)', maxFreq > 1 ? `${modes.slice(0, 3).join(', ')} (频次:${maxFreq})` : '无明显众数');
            addRow('标准差 (StdDev)', `${stdDev.toFixed(1)}`);
            addRow('变异系数 (CV)', `${(stdDev / avg * 100).toFixed(2)}%`);

            statList.pop(); // 移除最后一条多余的虚线
        } else {
            statList.push(drawList({ text: '当前区间内无有效出分数据' }));
        }

        all.push(drawDatablock({ list: statList, topLeftText: `数据特征分析` }));
    }

    all.push(await drawEventDatablock(event, [mainServer]));
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress })

    return [buffer];
}

export function getAverageTime(timestamps: Array<number>) {
    let res = 0
    for (let i = 0; i < timestamps.length >> 1; i += 1)
        res += timestamps[i]
    for (let i = timestamps.length + 1 >> 1; i < timestamps.length; i += 1)
        res -= timestamps[i]
    return res / (timestamps.length >> 1) / (timestamps.length + 1 >> 1)
}

function identifyRooms(players: any[], similarityThreshold = 0.9) {
    // 1. 将玩家的 speeds 转换为二进制节奏序列 (1表示有分变动, 0表示无)
    const playerRhythms = players.map(p => ({
        name: p.name,
        // 只有纯数字且大于0才视为有效出分时刻
        rhythm: p.speeds.map(s => {
            const val = String(s);
            return (val !== "---" && !val.includes("(") && parseInt(val) > 0) ? 1 : 0;
        })
    }));

    const rooms: string[][] = [];
    const assigned = new Set<string>();

    for (let i = 0; i < playerRhythms.length; i++) {
        if (assigned.has(playerRhythms[i].name)) continue;

        const currentRoom = [playerRhythms[i].name];
        for (let j = i + 1; j < playerRhythms.length; j++) {
            if (assigned.has(playerRhythms[j].name)) continue;

            let union = 0;
            let intersection = 0;
            const r1 = playerRhythms[i].rhythm;
            const r2 = playerRhythms[j].rhythm;

            for (let k = 0; k < r1.length; k++) {
                if (r1[k] === 1 || r2[k] === 1) union++;
                if (r1[k] === 1 && r2[k] === 1) intersection++;
            }

            const similarity = union === 0 ? 0 : intersection / union;

            if (similarity >= similarityThreshold) {
                currentRoom.push(playerRhythms[j].name);
            }
        }

        if (currentRoom.length > 1) {
            rooms.push(currentRoom);
            currentRoom.forEach(name => assigned.add(name));
        }
    }
    return rooms;
}

export function parseLimit(limit?: string): { min: number; max: number } {
    // 默认值
    let min = 0;
    let max = Infinity;
    if (!limit || typeof limit !== "string") {
        return { min, max };
    }
    let str = limit.trim()
        .replace(/＞/g, ">")
        .replace(/＜/g, "<")
        .replace(/＝/g, "=");
    // 匹配 ">N"
    if (/^>\d+$/.test(str)) min = Number(str.slice(1)) + 1;
    // 匹配 "<N"
    if (/^<\d+$/.test(str)) max = Number(str.slice(1)) - 1;
    // 匹配 ">=N"
    if (/^>=\d+$/.test(str)) min = Number(str.slice(1));
    // 匹配 "<=N"
    if (/^<=\d+$/.test(str)) max = Number(str.slice(1));
    // 匹配 "A-B"
    if (/^\d+-\d+$/.test(str)) {
        const [a, b] = str.split("-").map(Number);
        if (a <= b) {
            min = a;
            max = b;
        }
    }
    // 其他不合法输入 → 默认值
    return { min, max };
}
/**
 * 处理玩家分数数据，提取单把增量（diff）
 */
export function getSinglePlayDiffs(points: any[], playerUid: number, limit?: string) {
    const cleanData = getRatingByPlayer(points, playerUid);
    if (!cleanData || cleanData.length < 2) return [];

    // 解析限制条件
    const { min, max } = parseLimit(limit);

    // 计算差分
    const sortedData = [...cleanData].reverse();
    const results = [];

    for (let i = 1; i < sortedData.length; i++) {
        const current = sortedData[i];
        const prev = sortedData[i - 1];

        if (prev.value === -1 || current.value === -1) continue;

        const diff = current.value - prev.value;

        // 过滤逻辑
        if (diff >= min && diff <= max && diff > 0) {
            results.push({
                time: current.time,
                value: diff
            });
        }
    }
    return results;
}
