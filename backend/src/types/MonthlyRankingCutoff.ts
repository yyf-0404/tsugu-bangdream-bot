import { MonthlyRanking } from '@/types/MonthlyRanking';
import { Server } from '@/types/Server';
import { predict } from '@/api/cutoff.cjs'
import { getDateByServerTimezone, getServerUtcOffset, normalizeTimestamp } from '@/components/list/time';
import { MONTHRANKING_TURNS } from '@/config';
import { callRankingSources } from '@/api/rankingSources';

type MonthlyRankingBorderPoint = {
    time: number;
    ep: number;
};

type MonthlyRankingBorderResponse = {
    result: boolean;
    cutoffs: MonthlyRankingBorderPoint[];
};

type MonthlyRankingTopPoint = {
    timestamp?: number;
    time?: number;
    uid: number;
    value: number;
};

type MonthlyRankingPlayer = {
    uid: number;
    name: string;
    introduction: string;
    rank: number;
    sid: number;
    strained: number;
    degrees: number[];
};

type MonthlyRankingTopResponse = {
    points: MonthlyRankingTopPoint[];
    users: MonthlyRankingPlayer[];
};

export class MonthlyRankingCutoff {
    monthlyRankingId: number;
    server: Server;
    tier: number;
    isExist = false;
    cutoffs: { time: number, ep: number }[];
    latestCutoff: { time: number, ep: number };
    predictEP: number;
    startAt: number;
    endAt: number;
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull: boolean = false;
    dailyIncrement = [];
    monthlyRanking: MonthlyRanking;
    currentGetDataTime: number;

    constructor(monthlyRankingId: number, server: Server, tier: number) {
        this.monthlyRankingId = monthlyRankingId;
        this.server = server;
        this.tier = tier;
        this.monthlyRanking = new MonthlyRanking(monthlyRankingId);

        if (!this.monthlyRanking.isExist) {
            this.isExist = false;
            return;
        }

        const startAt = this.monthlyRanking.startAt[server];
        const endAt = this.monthlyRanking.endAt[server];
        if (startAt == null || endAt == null) {
            this.isExist = false;
            return;
        }

        this.startAt = startAt;
        this.endAt = endAt;
        this.currentGetDataTime = Date.now();
        this.isExist = tier > 0;

        const time = Date.now();
        if (time < this.startAt) {
            this.status = 'not_start';
        } else if (time > this.endAt) {
            this.status = 'ended';
        } else {
            this.status = 'in_progress';
        }
    }

    getMonthlyRankingName(server: Server): string {
        return this.monthlyRanking.monthlyRankingName[server] ?? this.monthlyRanking.monthlyRankingName.find(Boolean) ?? `月榜${ this.monthlyRankingId }`;
    }

    async initFull() {
        if (this.isInitfull || !this.isExist) {
            return;
        }

        const cutoffData = await this.getFinalCutoffsData();
        if (!cutoffData || cutoffData.result === false) {
            this.isExist = false;
            return;
        }

        this.cutoffs = cutoffData.cutoffs as { time: number, ep: number }[];
        if (this.cutoffs.length === 0) {
            this.latestCutoff = { time: this.startAt, ep: 0 };
            this.isInitfull = true;
            return;
        }

        this.latestCutoff = this.cutoffs[this.cutoffs.length - 1];
        this.getDailyIncrement();
        if (this.status === 'in_progress') {
            this.predict();
        }
        this.isInitfull = true;
    }

    async getFinalCutoffsData(forceReadCache: boolean = false): Promise<MonthlyRankingBorderResponse | undefined> {
        const ttl = forceReadCache ? Infinity : 0;
        return callRankingSources<MonthlyRankingBorderResponse>(
            this.server,
            MONTHRANKING_TURNS,
            `/api/monthlyRanking/border?server=${<number>this.server}&monthlyId=${this.monthlyRankingId}&tier=${this.tier}`,
            ttl,
        );
    }

    predict(): number {
        if (this.isExist === false || !this.cutoffs || this.cutoffs.length === 0) {
            this.predictEP = 0;
            return this.predictEP;
        }

        const last = this.cutoffs[this.cutoffs.length - 1];

        // 如果月榜已经结束，预测值直接等于当前最终分数
        if (last.time >= this.endAt) {
            this.predictEP = last.ep;
            return this.predictEP;
        }

        // 统一转换时间戳为秒 (以对齐回归算法的输入)
        const start_ts = Math.floor(this.startAt / 1000);
        const end_ts = Math.floor(this.endAt / 1000);
        const cutoff_ts: { time: number, ep: number }[] = [];

        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            cutoff_ts.push({
                time: Math.floor(element.time / 1000),
                ep: element.ep
            });
        }

        // 动态计算适用于月榜的 rate
        let currentRateFactor = 0;
        if (this.cutoffs.length >= 5) {
            const lastPoint = cutoff_ts[cutoff_ts.length - 1];

            // 寻找 1 小时前的点（3600秒）
            const oneHourAgoTime = lastPoint.time - 3600;
            let prevPoint = cutoff_ts[0];
            for (let i = cutoff_ts.length - 1; i >= 0; i--) {
                if (cutoff_ts[i].time <= oneHourAgoTime) {
                    prevPoint = cutoff_ts[i];
                    break;
                }
            }

            const dtCurrent = (lastPoint.time - prevPoint.time) / 3600; // 小时
            const dtTotal = (lastPoint.time - start_ts) / 3600; // 小时

            if (dtCurrent > 0 && dtTotal > 0) {
                const speedCurrent = (lastPoint.ep - prevPoint.ep) / dtCurrent; // 最近1小时时速(EP/h)
                const speedTotal = (lastPoint.ep - cutoff_ts[0].ep) / dtTotal;   // 全局平均时速(EP/h)

                // 如果最近 1 小时时速大于全局平均，说明在冲刺，计算冲刺斜率贡献
                if (speedTotal > 0 && speedCurrent > speedTotal) {
                    // 将时速增量转化为相较于总进度的百分比影响，给到回归方程作为修正因子
                    currentRateFactor = ((speedCurrent - speedTotal) / speedTotal) * 0.05;
                    // 限制最大修正幅度，防止 1min 级抖动导致 rate 冲天
                    currentRateFactor = Math.min(currentRateFactor, 0.2);
                }
            }
        }

        // 调用回归预测函数
        try {
            // 全局声明或引入的 predict 算法
            const result = predict(cutoff_ts, start_ts, end_ts, currentRateFactor);

            if (result && !isNaN(result.ep)) {
                this.predictEP = Math.floor(result.ep);
            } else {
                this.predictEP = last.ep;
            }
        } catch (e) {
            console.error("Monthly Ranking Predict Error: ", e);
            // 发生异常时执行原有的平滑线性线性外推
            const prev = this.cutoffs[Math.max(this.cutoffs.length - 60, 0)]; // 取1小时前
            const timeSpan = Math.max((last.time - prev.time) / (1000 * 3600), 1 / 60);
            const fallbackRate = (last.ep - prev.ep) / timeSpan;
            const remainHour = Math.max((this.endAt - last.time) / (1000 * 3600), 0);
            this.predictEP = Math.floor(last.ep + fallbackRate * remainHour);
        }

        return this.predictEP;
    }

    getDaysOfEvent(ts: number) {
        const offsetMs = getServerUtcOffset(this.server) * 60 * 60 * 1000;
        const eventStartAtTime = normalizeTimestamp(this.startAt);
        const timestamp = normalizeTimestamp(ts);
        const serverStartTime = eventStartAtTime + offsetMs;
        const startDate = new Date(serverStartTime);

        const hour = startDate.getUTCHours();
        const minute = startDate.getUTCMinutes();
        const second = startDate.getUTCSeconds();
        const millisecond = startDate.getUTCMilliseconds();

        const firstDayEndServerTime =
            serverStartTime +
            ((86400000 + 4 * 60 * 60 * 1000)
                - hour * 60 * 60 * 1000
                - minute * 60 * 1000
                - second * 1000
                - millisecond);

        const firstDayEndTime = firstDayEndServerTime - offsetMs;

        if (timestamp < firstDayEndTime) {
            return 0;
        }
        return Math.ceil((timestamp - firstDayEndTime) / 86400000);
    }

    getDailyIncrement() {
        const score: number[] = [];
        const time: number[] = [];
        if (!this.cutoffs || this.cutoffs.length === 0) {
            return;
        }

        for (const c of this.cutoffs) {
            const timestamp = normalizeTimestamp(c.time);
            const date = getDateByServerTimezone(timestamp, this.server);

            // 转换为对应服务器的本地时间进行判断
            const localHour = date.getUTCHours();
            const localMinute = date.getUTCMinutes();

            // 筛选出每天凌晨 4 点的数据点（因为 1min 一次，直接匹配 4:00）
            if (localHour === 4 && localMinute === 0) {
                score.push(c.ep);
                time.push(timestamp);
            }
        }

        const dailyIncrement: string[] = [];
        const dailyIncrementInvaildDays: number[] = [];
        const scoreFinal: number[] = [];
        let j = 0;
        const cutoffLastDataDays = this.getDaysOfEvent(this.cutoffs[this.cutoffs.length - 1].time);

        if (score.length == 0) {
            for (let i = 0; i <= this.getDaysOfEvent(this.cutoffs[this.cutoffs.length - 1].time); i++) {
                if (this.getDaysOfEvent(this.cutoffs[this.cutoffs.length - 1].time) == 0) {
                    scoreFinal.push(this.cutoffs[this.cutoffs.length - 1].ep);
                    break;
                }
                const avgIncrementValue = Math.round(((this.cutoffs[this.cutoffs.length - 1].ep) / (this.getDaysOfEvent(this.cutoffs[this.cutoffs.length - 1].time))));
                scoreFinal.push(Math.round(avgIncrementValue * (i + 1)));
                dailyIncrementInvaildDays.push(scoreFinal.length - 1);
                j++;
            }
        }

        for (let i = 0; i < score.length; i++) {
            if (score.length == 0) break;
            if (this.getDaysOfEvent(time[i]) == j) {
                if (this.getDaysOfEvent(time[i]) == 0) {
                    scoreFinal.push(score[i]);
                    j++;
                } else {
                    scoreFinal.push(score[i]);
                    j++;
                }
            } else {
                if (this.getDaysOfEvent(time[i]) > j) {
                    const lostDays = this.getDaysOfEvent(time[i]) - j + 1;
                    const avgIncrementValue = Math.round((i == 0 ? (score[i]) : (score[i] - score[i - 1])) / lostDays);
                    for (let ld = 0; ld < lostDays; ld++) {
                        scoreFinal.push(Math.round(i == 0 ? avgIncrementValue * (ld + 1) : score[i - 1] + avgIncrementValue * (ld + 1)));
                        dailyIncrementInvaildDays.push(scoreFinal.length - 1);
                        j++;
                    }
                }
            }
        }

        if (score.length != 0) {
            for (let i = 0; i < cutoffLastDataDays - this.getDaysOfEvent(time[time.length - 1]); i++) {
                if (score.length == 0) break;
                const avgIncrementValue = Math.round(((this.cutoffs[this.cutoffs.length - 1].ep - score[score.length - 1])) / (cutoffLastDataDays - this.getDaysOfEvent(time[time.length - 1])));
                scoreFinal.push(Math.round(score[score.length - 1] + avgIncrementValue * (i + 1)));
                if (cutoffLastDataDays - this.getDaysOfEvent(time[time.length - 1]) > 1) dailyIncrementInvaildDays.push(scoreFinal.length - 1);
                j++;
            }
        }

        for (let i = 0; i < scoreFinal.length; i++) {
            const val = i === 0 ? scoreFinal[i] : (scoreFinal[i] - scoreFinal[i - 1]);
            dailyIncrement.push(`${ Math.round(val) }${ dailyIncrementInvaildDays.includes(i) ? '!' : '' }`);
        }
        this.dailyIncrement = dailyIncrement;
    }

    getYesterdayIncrementRate() {
        if (!this.cutoffs || this.cutoffs.length === 0) {
            return '无数据';
        }

        // 1. 获取最新一个数据点及其服务器本地时间
        const lastCutoffIndex = this.cutoffs.length - 1;
        const lastCutoffTime = this.cutoffs[lastCutoffIndex].time;
        const lastCutoffEp = this.cutoffs[lastCutoffIndex].ep;

        const dateNow = getDateByServerTimezone(lastCutoffTime, this.server);
        const targetHour = dateNow.getUTCHours();
        const targetMinute = dateNow.getUTCMinutes();

        const curEventDays = this.getDaysOfEvent(lastCutoffTime);

        const targetMinutesOfDay = targetHour * 60 + targetMinute;

        // 收集每天 4 点的数据（ep + 时间戳）
        const score4AM: { ep: number; time: number }[] = [];
        // 收集昨天的所有数据点，用于找最近邻
        const yesterdayPoints: { ep: number; time: number }[] = [];

        // 2. 遍历筛选数据
        for (const c of this.cutoffs) {
            const timestamp = normalizeTimestamp(c.time);
            const d = this.getDaysOfEvent(timestamp);

            // 只关注最近 3 天内的数据（前天、昨天、今天）
            if (d < (curEventDays - 2)) {
                continue;
            }

            const date = getDateByServerTimezone(timestamp, this.server);
            const h = date.getUTCHours();
            const m = date.getUTCMinutes();

            // 筛选凌晨 4 点的结算点
            if (h === 4 && m === 0) {
                score4AM.push({ ep: c.ep, time: timestamp });
            }

            // 收集昨天的所有数据点
            if (d === (curEventDays - 1)) {
                yesterdayPoints.push({ ep: c.ep, time: timestamp });
            }
        }

        // 3. 校验数据完整性：score4AM 应包含昨天4点和今天4点（至少2个）
        if (score4AM.length < 2) {
            return '数据缺失';
        }
        if (yesterdayPoints.length === 0) {
            return '数据缺失';
        }

        // 在昨天的数据点中找最接近目标时刻的那个
        let nearestPoint = yesterdayPoints[0];
        let nearestDiff = Infinity;
        for (const p of yesterdayPoints) {
            const d = getDateByServerTimezone(p.time, this.server);
            const minutesOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
            const diff = Math.abs(minutesOfDay - targetMinutesOfDay);
            if (diff < nearestDiff) {
                nearestDiff = diff;
                nearestPoint = p;
            }
        }

        // score4AM 最后两个：昨天4点、今天4点
        const yesterday4AM = score4AM[score4AM.length - 2];
        const today4AM = score4AM[score4AM.length - 1];

        // 今天的时间跨度：从今天4点到现在
        const todayTimeSpan = lastCutoffTime - today4AM.time;
        // 昨天实际数据的时间跨度：从昨天4点到最近邻数据点
        const yesterdayTimeSpan = nearestPoint.time - yesterday4AM.time;

        if (todayTimeSpan <= 0 || yesterdayTimeSpan <= 0) {
            return '数据缺失';
        }

        // 今日截止到目前的增量 = 当前ep - 今天4点ep
        const TodaysIncrement = lastCutoffEp - today4AM.ep;

        // 昨天实际增量（原始时间跨度）
        const YesterdaysIncrementRaw = nearestPoint.ep - yesterday4AM.ep;

        // 线性对齐：将昨天的增量按时间比例缩放到今天的等效时长
        const YesterdaysIncrement = Math.round(YesterdaysIncrementRaw * (todayTimeSpan / yesterdayTimeSpan));

        // 4. 计算速率比值
        const rate: number = YesterdaysIncrement !== 0 ? TodaysIncrement / YesterdaysIncrement : 1;

        return `昨天同时刻日增${ Math.round(YesterdaysIncrement) } 现在是昨天的${ Math.round(rate * 100) }%${ rate * 100 >= 100 ? '↑' : '↓' }`;
    }

    getChartData(setStartToZero = false): { x: Date, y: number }[] {
        if (this.isExist == false) {
            return [];
        }
        const chartData: { x: Date, y: number }[] = [];
        if (setStartToZero) {
            chartData.push({ x: new Date(0), y: 0 });
        } else {
            chartData.push({ x: new Date(this.startAt), y: 0 });
        }

        let tempTime = this.cutoffs && this.cutoffs.length > 0 ? this.cutoffs[0].time : null;
        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            if (setStartToZero) {
                chartData.push({ x: tempTime ? new Date(element.time - this.startAt) : new Date(0), y: element.ep });
            } else {
                chartData.push({ x: new Date(element.time), y: element.ep });
            }
            tempTime = element.time;
        }
        return chartData;
    }
}

export class MonthlyRankingCutoffTop {
    monthlyRankingId: number;
    server: Server;
    startAt: number;
    endAt: number;
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull: boolean = false;
    isExist = false;
    points: {
        time: number,
        uid: number,
        value: number
    }[];
    users: {
        uid: number,
        name: string,
        introduction: string,
        rank: number,
        sid: number,
        strained: number,
        degrees: number[]
        ranking: number,
        currentPt: number
    }[];
    monthlyRanking: MonthlyRanking;

    constructor(monthlyRankingId: number, server: Server) {
        this.monthlyRankingId = monthlyRankingId;
        this.server = server;
        this.monthlyRanking = new MonthlyRanking(monthlyRankingId);
        if (!this.monthlyRanking.isExist) {
            this.isExist = false;
            return;
        }
        const startAt = this.monthlyRanking.startAt[server];
        const endAt = this.monthlyRanking.endAt[server];
        if (startAt == null || endAt == null) {
            this.isExist = false;
            return;
        }
        this.startAt = startAt;
        this.endAt = endAt;
        this.isExist = true;
        const time = Date.now();
        if (time < this.startAt) {
            this.status = 'not_start';
        } else if (time > this.endAt) {
            this.status = 'ended';
        } else {
            this.status = 'in_progress';
        }
    }

    getMonthlyRankingName(server: Server): string {
        return this.monthlyRanking.monthlyRankingName[server] ?? this.monthlyRanking.monthlyRankingName.find(Boolean) ?? `月榜${ this.monthlyRankingId }`;
    }

    async initFull(_interval = 3600000) {
        if (!this.isExist || this.isInitfull) {
            return;
        }
        const topData = await callRankingSources<MonthlyRankingTopResponse>(
            this.server,
            MONTHRANKING_TURNS,
            `/api/monthlyRanking/top?server=${<number>this.server}&monthlyId=${this.monthlyRankingId}`,
        );
        if (topData == undefined) {
            this.isExist = false;
            return;
        }
        this.points = (topData.points ?? []).map((point) => ({
            time: Number(point.time ?? point.timestamp),
            uid: point.uid,
            value: point.value,
        }));
        this.users = (topData.users ?? []).map((user) => ({
            ...user,
            ranking: 0,
            currentPt: 0,
        }));
        if (this.points.length == 0 || this.users.length == 0) {
            this.isExist = false;
            return;
        }

        const latestRanking = this.getLatestRanking();
        for (let i = 0; i < this.users.length; i++) {
            for (let j = 0; j < latestRanking.length; j++) {
                if (this.users[i].uid == latestRanking[j].uid) {
                    this.users[i].ranking = j + 1;
                    this.users[i].currentPt = latestRanking[j].point;
                    break;
                }
            }
        }
        this.isInitfull = true;
    }

    getChartData(setStartToZero = false): { [key: number]: { x: Date, y: number }[] } {
        if (this.isExist == false) {
            return;
        }
        const chartDate: { [key: number]: { x: Date, y: number }[] } = {};
        for (let i = 0; i < this.points.length; i++) {
            const element = this.points[i];
            if (!(element.uid in chartDate)) {
                chartDate[element.uid] = [];
                if (setStartToZero) {
                    chartDate[element.uid].push({ x: new Date(0), y: 0 });
                    chartDate[element.uid].push({ x: new Date(element.time - this.startAt), y: element.value });
                } else {
                    chartDate[element.uid].push({ x: new Date(this.startAt), y: 0 });
                    chartDate[element.uid].push({ x: new Date(element.time), y: element.value });
                }
            } else {
                if (setStartToZero) {
                    chartDate[element.uid].push({ x: new Date(element.time - this.startAt), y: element.value });
                } else {
                    chartDate[element.uid].push({ x: new Date(element.time), y: element.value });
                }
            }
        }
        return chartDate;
    }

    getLatestRanking(): { uid: number, point: number }[] {
        const result: { uid: number, point: number }[] = [];
        if (!this.points?.length) return result;
        const latestTime = Math.max(...this.points.map(point => point.time));
        const latestPoints = this.points.filter(point => point.time === latestTime);
        const snapshot = latestPoints.length ? latestPoints : this.points.slice(-10);
        for (const element of snapshot) {
            result.push({ uid: element.uid, point: element.value });
        }
        result.sort((a, b) => b.point - a.point);
        return result;
    }

    getUserByUid(id: number): {
        uid: number,
        name: string,
        introduction: string,
        rank: number,
        sid: number,
        strained: number,
        degrees: number[]
        ranking: number,
        currentPt: number
    } {
        for (let i = 0; i < this.users.length; i++) {
            if (this.users[i].uid == id) {
                return this.users[i];
            }
        }
        return;
    }

    getUserNameById(id: number): string {
        for (let i = 0; i < this.users.length; i++) {
            if (this.users[i].uid == id) {
                return this.users[i].name;
            }
        }
        return;
    }
}
