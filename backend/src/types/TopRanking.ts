export type TopPoint = { time: number; uid: number; value: number };
export type TopSnapshot = { time: number; points: TopPoint[] };
export type TopPlayer = {
    uid: number;
    name: string;
    introduction: string;
    rank: number;
    sid: number;
    strained: number;
    degrees: number[];
};
export type LegacyTopResponse = {
    points: { time?: number; timestamp?: number; uid: number; value: number }[];
    users: TopPlayer[];
};
export type TopHistoryResponse = {
    baseline: { at: number; ranking: [number, number][] | null; gap: boolean } | null;
    samples: {
        at: number;
        type: 'FULL' | 'PATCH' | 'SAME' | 'GAP';
        ranking?: [number, number][];
        effectiveAt?: number;
    }[];
};
export type TopData = { points: TopPoint[]; snapshots: TopSnapshot[]; users: TopPlayer[] };

export function normalizeLegacyTop(data: LegacyTopResponse): TopData {
    const points = data.points.map(point => ({
        time: Number(point.time ?? point.timestamp), uid: point.uid, value: point.value,
    })).filter(point => Number.isFinite(point.time)).sort((a, b) => a.time - b.time);
    const snapshots: TopSnapshot[] = [];
    for (const point of points) {
        if (snapshots.at(-1)?.time !== point.time) snapshots.push({ time: point.time, points: [] });
        snapshots.at(-1).points.push(point);
    }
    // 旧接口以分数确定名次，同分时保留接口顺序。
    for (const snapshot of snapshots) snapshot.points.sort((a, b) => b.value - a.value);
    return { points: snapshots.flatMap(snapshot => snapshot.points), snapshots, users: data.users ?? [] };
}

export function normalizeTopHistory(data: TopHistoryResponse, users: TopPlayer[] = []): TopData {
    const snapshots: TopSnapshot[] = [];
    const append = (time: number, ranking: [number, number][]) => {
        if (!Number.isFinite(time) || !Array.isArray(ranking)) throw new Error('Invalid Top snapshot');
        // 终榜复核使用 effectiveAt；同一生效时刻只保留最后一次修订，包括空榜。
        while (snapshots.length && snapshots.at(-1).time >= time) snapshots.pop();
        snapshots.push({ time, points: ranking.map(([uid, value]) => ({ time, uid, value })) });
    };
    if (data.baseline?.ranking && !data.baseline.gap) append(data.baseline.at, data.baseline.ranking);
    for (const sample of data.samples) {
        // API 已展开 PATCH/SAME，不能再次应用增量，也不能为 GAP 补造分数。
        if (sample.type === 'GAP') continue;
        append(sample.effectiveAt ?? sample.at, sample.ranking);
    }
    return { points: snapshots.flatMap(snapshot => snapshot.points), snapshots, users };
}

/** 返回目标时刻之前（含该时刻）的完整快照；空榜不能回填上一批玩家。 */
export function rankingAt(snapshots: TopSnapshot[], time = Infinity): TopPoint[] {
    let left = 0, right = snapshots.length - 1;
    while (left <= right) {
        const mid = (left + right) >>> 1;
        if (snapshots[mid].time <= time) left = mid + 1;
        else right = mid - 1;
    }
    return right < 0 ? [] : snapshots[right].points;
}

export function topUsers(data: TopData) {
    const profiles = new Map(data.users.map(user => [user.uid, user]));
    // 资料缺失不影响实际参榜人数，名称可退回 UID。
    for (const { uid } of data.points) {
        if (!profiles.has(uid)) profiles.set(uid, {
            uid, name: String(uid), introduction: '', rank: 0, sid: 0, strained: 0, degrees: [],
        });
    }
    const latest = new Map(rankingAt(data.snapshots).map((point, index) => [point.uid, { ranking: index + 1, currentPt: point.value }]));
    return [...profiles.values()].map(user => ({ ...user, ranking: 0, currentPt: 0, ...latest.get(user.uid) }));
}

export function getRatingByPlayer(points: TopPoint[], playerId: number) {
    const values = new Map<number, number>();
    for (const point of points) {
        if (!values.has(point.time)) values.set(point.time, -1);
        if (point.uid === playerId) values.set(point.time, point.value);
    }
    return [...values].sort(([a], [b]) => b - a).map(([time, value]) => ({ time, value }));
}

export function getTopRatingDuringTime(cutoffTop: {
    points: TopPoint[];
    getRankingAt(time?: number): TopPoint[];
    getUserNameById(uid: number): string;
}, windowTimeLimit: number = 60, date: Date, compareTier: number, comparePlayerUid: number) {
    const limitPoints = date ? cutoffTop.points.filter(item => item.time <= date.getTime()) : cutoffTop.points;
    const current = cutoffTop.getRankingAt(date?.getTime());
    if (!current.length) return [];
    const now = current[0].time;
    const top10List = current.map(({ uid, value }) => ({ uid, point: value }));
    const firstTime = limitPoints[0]?.time ?? now;
    const top10_Old = cutoffTop.getRankingAt(Math.max(firstTime, now - windowTimeLimit * 60 * 1000));
    if (!top10_Old.length) return [];
    const old_time = top10_Old[0].time;
    const top10_ranking: {
        ranking: number,
        uid: number,
        name: string,
        point: number,
        distanceToAbove: number,
        distanceToPlayer: number,
        speedInTime: number,
        speedRanking: number,
        playTimes: number,
        firstTime: string,
        lastTime: string,
        averagePoints: number,
        nowTime: string,
        oldTime: string,
    }[] = [];
    const speed: { uid: number, speed: number, speedRanking: number }[] = computeSpeed(top10List, top10_Old)
    const windowPoints = limitPoints.filter(item => item.time >= old_time);

    top10List.forEach((info, index) => {
        const uid = info.uid;
        const nowPoints = info.point;
        const comparePlayerPoints = compareTier ? (top10List?.[compareTier - 1]?.point) : (comparePlayerUid ? top10List.find(item => item.uid == comparePlayerUid)?.point : undefined);
        const playerSpeedInfo = speed.find(item => item.uid == uid);
        const playerTimesInfo = countSpeedData(getRatingByPlayer(windowPoints, uid))
        const fmt = new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            dateStyle: 'medium',
            timeStyle: 'medium'
        });
        top10_ranking.push({
            ranking: index + 1,
            uid: uid,
            name: cutoffTop.getUserNameById(uid),
            point: nowPoints,
            distanceToAbove: index == 0 ? 0 : top10List[index - 1].point - nowPoints,
            distanceToPlayer: comparePlayerPoints != null ? nowPoints - comparePlayerPoints : 0,
            speedInTime: playerSpeedInfo.speed,
            speedRanking: playerSpeedInfo.speedRanking,
            playTimes: playerTimesInfo.count,
            firstTime: playerTimesInfo.firstTime > 0 ? `${Math.round((playerTimesInfo.firstTime - old_time) / (60 * 1000))}min` : '',
            lastTime: playerTimesInfo.lastTime > 0 ? `${Math.round((playerTimesInfo.lastTime - now) / (60 * 1000))}min` : '',
            averagePoints: playerTimesInfo.count > 0 ? Math.floor(playerSpeedInfo.speed / playerTimesInfo.count) : 0,
            nowTime: fmt.format(new Date(now)),
            oldTime: fmt.format(new Date(old_time))
        })
    })
    return top10_ranking;
}

function computeSpeed(
    top10List: { uid: number; point: number }[],
    top10_Old: { time: number; uid: number; value: number }[]
): { uid: number; speed: number; speedRanking: number }[] {
    const speed: { uid: number; speed: number; speedRanking: number }[] = [];
    //无数据的默认值
    const fallbackValue = top10_Old.length === 10 ? top10_Old.at(-1).value : 0;
    //创建map集合方便查询
    const oldValueMap = new Map<number, number>();
    for (const { uid, value } of top10_Old) {
        oldValueMap.set(uid, value);
    }
    for (const { uid, point } of top10List) {
        const oldPoint = oldValueMap.get(uid) ?? fallbackValue;
        speed.push({ uid, speed: point - oldPoint, speedRanking: 0 });
    }
    speed.sort((a, b) => b.speed - a.speed);
    for (let i = 0; i < speed.length; i++) {
        speed[i].speedRanking = speed[i].speed > 0 ? i + 1 : 0;
    }
    return speed;
}

function countSpeedData(playerPoints: { time: number; value: number }[]) {
    let firstTime = 0, lastTime = 0, count = 0;
    let previous: number | undefined;
    for (let i = playerPoints.length - 1; i >= 0; i--) {
        const { time, value } = playerPoints[i];
        if (value < 0) return { firstTime: -1, lastTime: -1, count: -1 };
        if (previous !== undefined && value !== previous) {
            if (!count) firstTime = time;
            lastTime = time;
            count++;
        }
        previous = value;
    }
    return { firstTime, lastTime, count };
}
