import { Server } from "@/types/Server";
import { Event } from '@/types/Event';
import { callAPIAndCacheResponse } from "@/api/getApi";
import { Bestdoriurl, EVENTRANKING_TURNS, resolveSourceUrls } from "@/config";
import { logger } from '@/logger';


export class CutoffEventTop{
    eventId:number;
    server:Server;
    startAt:number;
    endAt:number;
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull: boolean = false;
    isExist = false;
    points:{
        time:number,
        uid:number,
        value:number
    }[];
    users:{
        uid:number,
        name:string,
        introduction:string,
        rank:number,
        sid:number,
        strained:number,
        degrees:number[]
        ranking:number,
        currentPt:number
    }[];
    constructor(eventId:number,server:Server){
        const event = new Event(eventId)
        if(!event.isExist){
            this.isExist = false;
            return;
        }
        this.eventId = eventId;
        this.server = server;
        this.isExist = true;
        this.startAt = event.startAt[server]
        this.endAt = event.endAt[server]
        var time = new Date().getTime()
        if (time < event.startAt[this.server]) {
            this.status = 'not_start';
        }
        else if (time > event.endAt[this.server]) {
            this.status = 'ended';
        }
        else {
            this.status = 'in_progress';
        }
    }
    private getEventTopSources(): { url: string, name: string }[] {
        return resolveSourceUrls(Server[this.server], EVENTRANKING_TURNS);
    }

    getFinalApiUrl (){
        const sources = this.getEventTopSources();
        return sources[0]?.url || Bestdoriurl;
    }
    async getFinalEventTopData (interval:number = 3600000){
        const sources = this.getEventTopSources();
        for (let i = 0; i < sources.length; i++) {
            try {
                return await callAPIAndCacheResponse(
                    `${sources[i].url}/api/eventtop/data?server=${<number>this.server}&event=${this.eventId}&mid=0&interval=${interval}`,
                    0, 3
                );
            } catch (e) {
                if (e.response?.status != 404) {
                    logger('CutoffEventTop.ts/getFinalEventTopData', `${sources[i].name}获取失败，尝试下一个`);
                }
            }
        }
        return null;
    }
    async initFull(interval = 3600000){
        if (!this.isExist){
            return
        }
        if(this.isInitfull){
            return;
        }
        const topData = await this.getFinalEventTopData(interval);
        if(topData == undefined || topData == null){
            this.isExist = false;
            return;
        }
        this.isExist = true;
        this.points = (topData['points'] ?? []).map((point) => ({
            time: Number(point.time ?? point.timestamp),
            uid: point.uid,
            value: point.value,
        })).filter((point) => Number.isFinite(point.time));
        this.users = topData['users'] as {
            uid:number,
            name:string,
            introduction:string,
            rank:number,
            sid:number,
            strained:number,
            degrees:number[],
            ranking:number,
            currentPt:number
        }[];
        if(this.points.length == 0 || this.users.length == 0){//如果没有数据，返回不存在
            this.isExist = false
            return
        }
        var latestRanking = this.getLatestRanking();
        for(let i =0;i<this.users.length;i++){
            for(let j =0;j<latestRanking.length;j++){
                if(this.users[i].uid==latestRanking[j].uid){
                    this.users[i].ranking = j+1;
                    this.users[i].currentPt = latestRanking[j].point;
                    break;
                }
            }
        }
    }
    getChartData(setStartToZero = false):{[key:number]:{x:Date,y:number}[]}{
        if (this.isExist == false) {
            return;
        }
        var chartDate:{[key:number]:{x:Date,y:number}[]} = {};
        for(let i =0;i<this.points.length;i++){
            const element = this.points[i]
            if(!(element.uid in chartDate)){
                chartDate[element.uid] = [];
                if(setStartToZero){
                    chartDate[element.uid].push({x:new Date(0),y:0});
                    chartDate[element.uid].push({x:new Date(element.time-this.startAt),y:element.value});
                }
                else{
                    chartDate[element.uid].push({x:new Date(this.startAt),y:0});
                    chartDate[element.uid].push({x:new Date(element.time),y:element.value});
                }
            }
            else{
                if(setStartToZero){
                    chartDate[element.uid].push({x:new Date(element.time-this.startAt),y:element.value});
                }
                else{
                    chartDate[element.uid].push({x:new Date(element.time),y:element.value});
                }
            }
        }
        return chartDate;
    }
    getLatestRanking():{uid:number,point:number}[]{
        const result:{uid:number,point:number}[] = []
        if (!this.points?.length) return result
        const latestTime = Math.max(...this.points.map(point => point.time))
        const latestPoints = this.points.filter(point => point.time === latestTime)
        const snapshot = latestPoints.length ? latestPoints : this.points.slice(-10)
        for (const element of snapshot) result.push({ uid: element.uid, point: element.value })
        result.sort((a,b)=>b.point-a.point)
        return result;
    }
    getUserByUid(id:number):{
        uid:number,
        name:string,
        introduction:string,
        rank:number,
        sid:number,
        strained:number,
        degrees:number[]
        ranking:number,
        currentPt:number
    }{
        for(let i =0;i<this.users.length;i++){
            if(this.users[i].uid==id){
                return this.users[i];
            }
        }
        return;
    }
    getUserNameById(id:number):string{
        for(let i =0;i<this.users.length;i++){
            if(this.users[i].uid==id){
                return this.users[i].name;
            }
        }
        return;
    }
}
