import * as path from 'path';
import { Server } from '@/types/Server';
import { logger } from './logger';
import * as dotenv from 'dotenv';

dotenv.config();

export const projectRoot: string = path.resolve(path.dirname(__dirname));
export const assetsRootPath: string = path.join(projectRoot, '/assets');
export const configPath: string = path.join(projectRoot, '/config');
export const fuzzySearchPath = path.join(configPath, '/fuzzy_search_settings.json');
export const carKeywordPath = path.join(configPath, '/car_keyword.json');
export const cacheRootPath: string = path.join(projectRoot, '/cache');

export const BestdoriapiPath = { //Bestdori网站的列表api路径
    'cards': '/api/cards/all.5.json',
    'characters': '/api/characters/main.3.json',
    'bands': '/api/bands/main.1.json',
    'singer': '/api/bands/all.1.json',
    'skills': '/api/skills/all.10.json',
    'costumes': '/api/costumes/all.5.json',
    'events': '/api/events/all.6.json',
    'degrees': '/api/degrees/all.3.json',
    'gacha': '/api/gacha/all.5.json',
    'songs': '/api/songs/all.7.json',
    'meta': '/api/songs/meta/all.5.json',
    'loginCampaigns': '/api/loginCampaigns/all.5.json',
    'miracleTicketExchanges': '/api/miracleTicketExchanges/all.5.json',
    'comics': '/api/comics/all.5.json',
    'areaItems': '/api/areaItems/main.5.json',
    'rates': '/api/tracker/rates.json',
    'items': '/api/misc/itemtexts.2.json',
    'deco': '/api/deco/pins.all.3.json',
    'stamps': '/api/stamps/all.2.json',
    'monthlyRanking': '/api/monthlyRanking/info.json'
}
export const bindingPlayerPromptWaitingTime: number = 5 * 60 * 10000

export const Bestdoriurl: string = 'https://bestdori.com'; //Bestdori网站的url
export const BandoriStationurl: string = 'https://api.bandoristation.com/'; //BandoriStation网站的url

export const HHWX_Url: string = 'https://hhwx.org'; //HHWX网站的url
export var USE_HHWX_SOURCE_PREFER = false;   // 是否优先使用HHWX的Tracker数据

export const STAR_VIEWER_Url: string = process.env.RANKING_API_BASE_URL || 'https://grp-speed-backend.starfreedomx.top';
export var USE_STAR_VIEWER_SOURCE_PREFER = true;   // 是否优先使用STAR_VIEWER的Tracker数据

// ===== 数据源回退链配置 =====
// 数据源key → URL映射
export const SOURCE_URL_MAP: Record<string, string> = {
    "star_viewer": STAR_VIEWER_Url,
    "bestdori": Bestdoriurl,
    "hhwx": HHWX_Url
};

// 活动档线数据源回退链（按服务器，越靠前优先级越高）
export const EVENTRANKING_TURNS: Record<string, string[]> = {
    "cn": ["star_viewer", "bestdori", "hhwx"],
    "jp": ["star_viewer", "bestdori"],
    "default": ["bestdori"]
};

// 歌榜数据源回退链（仅STAR_VIEWER有歌榜数据）
export const MUSICRANKING_TURNS: Record<string, string[]> = {
    "cn": ["star_viewer"],
    "jp": ["star_viewer"],
    "default": ["star_viewer"]
};

// 月榜数据源回退链
export const MONTHRANKING_TURNS: Record<string, string[]> = {
    "global": ["star_viewer"],
    "cn": ["star_viewer"],
    "jp": ["star_viewer"],
    "default": ["star_viewer"]
};

// 统一解析：将server和turns配置转换为 {url, name} 数组
export function resolveSourceUrls(server: string, turnsConfig: Record<string, string[]>): {url: string, name: string}[] {
    const keys = turnsConfig[server] || turnsConfig["default"] || ["bestdori"];
    return keys.map(key => ({ url: SOURCE_URL_MAP[key], name: key }));
}

const enableAutoTrackerDataSourceSwitch = true  // 是否开启数据源优先自动切换
const trackerAutoSwitchThreshold:number = 5     // 设定数据源自动切换门限，当存在5次数据源更新不及时的情况，自动切换数据源，加快访问速度
var trackerAutoSwitchFlags:number = 0
export function reportDataSourceProblem(){
    if(enableAutoTrackerDataSourceSwitch){
        if(++trackerAutoSwitchFlags > trackerAutoSwitchThreshold-1){
            USE_HHWX_SOURCE_PREFER = !USE_HHWX_SOURCE_PREFER
            logger('config.ts/reportDataSourceProblem',`Tracker数据源多次出现问题，将数据源优先切换至${USE_HHWX_SOURCE_PREFER?"HHWX":"Bestdori"}`)
            trackerAutoSwitchFlags = 0
        }
    }
}
export function clearDataSourceProblem(){
    trackerAutoSwitchFlags = 0
}

var starViewerAutoSwitchFlags:number = 0
export function reportSTAR_VIEWERDataSourceProblem(){
    if(enableAutoTrackerDataSourceSwitch){
        if(++starViewerAutoSwitchFlags > trackerAutoSwitchThreshold-1){
            USE_STAR_VIEWER_SOURCE_PREFER = !USE_STAR_VIEWER_SOURCE_PREFER
            logger('config.ts/reportSTAR_VIEWERDataSourceProblem',`Tracker数据源多次出现问题，将数据源优先切换至${USE_STAR_VIEWER_SOURCE_PREFER?"STAR_VIEWER":"Bestdori"}`)
            starViewerAutoSwitchFlags = 0
        }
    }
}
export function clearSTAR_VIEWERDataSourceProblem(){
    starViewerAutoSwitchFlags = 0
}

export const globalDefaultServer: Array<Server> = [Server.cn, Server.jp]//默认服务器列表
export const globalServerPriority: Array<Server> = [Server.cn, Server.jp, Server.tw, Server.en, Server.kr]//默认服务器优先级

export const serverNameFullList = [
    '日服',
    '国际服',
    '台服',
    '国服',
    '韩服'
]

export const tierListOfServer = {
    'jp': [20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000, 30000, 50000],
    'tw': [100, 500],
    'en': [50, 100, 300, 500, 1000, 2000, 2500],
    'kr': [100],
    'cn': [20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 1500, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 50000]
}

export const statusName = {
    'not_start': '未开始',
    'in_progress': '进行中',
    'ended': '已结束'
}
