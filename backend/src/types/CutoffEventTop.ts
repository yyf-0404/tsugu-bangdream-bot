import { Server } from "@/types/Server";
import { Event } from '@/types/Event';
import { Bestdoriurl, EVENTRANKING_TURNS, resolveSourceUrls } from "@/config";
import { getTopRankingData } from '@/api/topRanking';
import { TopSnapshot, rankingAt, topUsers } from '@/types/TopRanking';


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
    snapshots: TopSnapshot[] = [];
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
        return getTopRankingData(this.server, EVENTRANKING_TURNS, 'event', this.eventId,
            `/api/eventtop/data?server=${this.server}&event=${this.eventId}&mid=0&interval=${interval}`);
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
        this.points = topData.points;
        this.snapshots = topData.snapshots;
        this.users = topUsers(topData);
        this.isExist = this.points.length > 0 || this.snapshots.length > 0;
        this.isInitfull = true;
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
    getRankingAt(time = Infinity) {
        return rankingAt(this.snapshots, time);
    }
    getLatestRanking(): { uid: number, point: number }[] {
        return this.getRankingAt().map(({ uid, value }) => ({ uid, point: value }));
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
