import { Server } from '@/types/Server';
import { Event } from '@/types/Event';
import { MUSICRANKING_TURNS } from '@/config';
import { predict } from '@/api/cutoff.cjs';
import { callRankingSources } from '@/api/rankingSources';

type MusicRankingBorderPoint = {
    time: number;
    ep: number;
};

type MusicRankingBorderResponse = {
    result: boolean;
    cutoffs: MusicRankingBorderPoint[];
};

type MusicRankingTopPoint = {
    timestamp?: number;
    time?: number;
    uid: number;
    value: number;
};

type MusicRankingPlayer = {
    uid: number;
    name: string;
    introduction: string;
    rank: number;
    sid: number;
    strained: number;
    degrees: number[];
};

type MusicRankingTopResponse = {
    points: MusicRankingTopPoint[];
    users: MusicRankingPlayer[];
};

export class MusicRankingCutoff {
    eventId: number;
    server: Server;
    tier: number;
    musicId: number;
    isExist = false;
    cutoffs: { time: number, ep: number }[];
    latestCutoff: { time: number, ep: number };
    predictEP: number;
    startAt: number;
    endAt: number;
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull: boolean = false;
    event: Event;

    constructor(eventId: number, server: Server, tier: number, musicId: number) {
        this.eventId = eventId;
        this.server = server;
        this.tier = tier;
        this.musicId = musicId;
        this.event = new Event(eventId);

        if (!this.event.isExist) {
            this.isExist = false;
            return;
        }

        const startAt = this.event.startAt[server];
        const endAt = this.event.endAt[server];
        if (startAt == null || endAt == null) {
            this.isExist = false;
            return;
        }

        this.startAt = startAt;
        this.endAt = endAt;
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
        if (this.status === 'in_progress') {
            this.predict();
        }
        this.isInitfull = true;
    }

    async getFinalCutoffsData(): Promise<MusicRankingBorderResponse | undefined> {
        return callRankingSources<MusicRankingBorderResponse>(
            this.server,
            MUSICRANKING_TURNS,
            `/api/tracker/data?server=${<number>this.server}&event=${this.eventId}&tier=${this.tier}&mid=${this.musicId}`,
        );
    }

    predict(): number {
        if (this.isExist === false || !this.cutoffs || this.cutoffs.length === 0) {
            this.predictEP = 0;
            return this.predictEP;
        }

        const last = this.cutoffs[this.cutoffs.length - 1];
        if (last.time >= this.endAt) {
            this.predictEP = last.ep;
            return this.predictEP;
        }

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

        try {
            const result = predict(cutoff_ts, start_ts, end_ts, null);
            if (result && !isNaN(result.ep)) {
                this.predictEP = Math.floor(result.ep);
            } else {
                this.predictEP = last.ep;
            }
        } catch {
            this.predictEP = last.ep;
        }

        return this.predictEP;
    }

    getPredictionHistory(): { time: number, ep: number }[] {
        if (this.isExist == false || !this.cutoffs) {
            return [];
        }
        const event = new Event(this.eventId);
        const start_ts = Math.floor(event.startAt[this.server] / 1000);
        const end_ts = Math.floor(event.endAt[this.server] / 1000);
        const cutoff_ts: { time: number, ep: number }[] = [];
        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            cutoff_ts.push({ time: Math.floor(element.time / 1000), ep: element.ep });
        }
        const history: { time: number, ep: number }[] = [];
        for (let i = 0; i < cutoff_ts.length; i++) {
            let result;
            try {
                result = predict(cutoff_ts.slice(0, i + 1), start_ts, end_ts, null);
            } catch {
                continue;
            }
            if (result && result.ep && !isNaN(result.ep) && result.ep !== 0) {
                history.push({ time: this.cutoffs[i].time, ep: Math.floor(result.ep) });
            }
        }
        return history;
    }

    getChartData(setStartToZero = false): { x: Date, y: number }[] {
        if (this.isExist == false) {
            return [];
        }
        const chartData: { x: Date, y: number }[] = [];
        const startY = this.cutoffs && this.cutoffs.length > 0
            ? Math.min(...this.cutoffs.slice(0, 10).map(c => c.ep))
            : 0;
        if (setStartToZero) {
            chartData.push({ x: new Date(0), y: startY });
        } else {
            chartData.push({ x: new Date(this.startAt), y: startY });
        }

        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            if (setStartToZero) {
                chartData.push({ x: new Date(element.time - this.startAt), y: element.ep });
            } else {
                chartData.push({ x: new Date(element.time), y: element.ep });
            }
        }
        return chartData;
    }
}

export class MusicRankingCutoffTop {
    eventId: number;
    server: Server;
    musicId: number;
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
    event: Event;

    constructor(eventId: number, server: Server, musicId: number) {
        this.eventId = eventId;
        this.server = server;
        this.musicId = musicId;
        this.event = new Event(eventId);

        if (!this.event.isExist) {
            this.isExist = false;
            return;
        }

        const startAt = this.event.startAt[server];
        const endAt = this.event.endAt[server];
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

    async initFull(_interval = 3600000) {
        if (!this.isExist || this.isInitfull) {
            return;
        }
        const topData = await callRankingSources<MusicRankingTopResponse>(
            this.server,
            MUSICRANKING_TURNS,
            `/api/eventtop/data?server=${<number>this.server}&event=${this.eventId}&mid=${this.musicId}`,
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
        const startY = this.points && this.points.length > 0
            ? Math.min(...this.points.slice(0, 10).map(p => p.value))
            : 0;
        const chartDate: { [key: number]: { x: Date, y: number }[] } = {};
        for (let i = 0; i < this.points.length; i++) {
            const element = this.points[i];
            if (!(element.uid in chartDate)) {
                chartDate[element.uid] = [];
                if (setStartToZero) {
                    chartDate[element.uid].push({ x: new Date(0), y: startY });
                    chartDate[element.uid].push({ x: new Date(element.time - this.startAt), y: element.value });
                } else {
                    chartDate[element.uid].push({ x: new Date(this.startAt), y: startY });
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
