import { Server } from "@/types/Server";
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { getServerByServerId } from '@/types/Server';
import axios from 'axios';
import { PlayerDB } from "@/database/playerDB";
import { playerDetail } from "@/types/BuildTypes";
import express from 'express';
import { body } from 'express-validator'; // Import express-validator functions
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { getPresentEvent } from '@/types/Event';
import { buildResult, cardInfo } from "@/types/BuildTypes"
import { AreaItemType } from "@/types/AreaItem";
import { drawResult } from "@/view/calcResult";
import { compositionResultDB } from "@/database/compositionResultDB";

const router = express.Router();
const playerDB = new PlayerDB(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/', 'tsugu-bangdream-bot')
const resultDB = new compositionResultDB(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/', 'tsugu-bangdream-bot')
const optimizeCalcApiUrl = (() => {
    const calcEndpoint = process.env.BANGDREAM_OPTIMIZE_CALC_URL?.trim()
    if (calcEndpoint) {
        return calcEndpoint.replace(/\/+$/, '')
    }

    const baseUrl = (process.env.BANGDREAM_OPTIMIZE_BASE_URL ?? 'http://127.0.0.1:3100').trim().replace(/\/+$/, '')
    return `${baseUrl}/v1/calc-result`
})();

type AreaStats = 'performance' | 'technique' | 'visual'

interface CalcSongResult {
    songId: number;
    difficulty: number;
    score: number;
    stat: number;
    teamCardIds: number[];
    captainCardId: number;
}

interface CalcResponseItems {
    band: string;
    attribute: string;
    magazine: AreaStats;
}

interface CalcResponse {
    eventId: number;
    totalScore: number;
    totalStat: number;
    songs: CalcSongResult[];
    items?: CalcResponseItems;
}

interface ApiEnvelope {
    status: 'ok' | 'error';
    data?: CalcResponse;
    message?: string;
}

const DEFAULT_ITEM_SELECTION = {
    band: '1000',
    attribute: '~all',
    magazine: 'performance' as AreaStats,
};

function normalizeMagazine(value?: string): AreaStats {
    if (value === 'performance' || value === 'technique' || value === 'visual') {
        return value
    }
    return DEFAULT_ITEM_SELECTION.magazine
}

function toCardInfo(cardId: number, player: playerDetail): cardInfo {
    const result = new cardInfo(cardId);
    const cardConfig = player.cardList[cardId];

    if (cardConfig) {
        result.illustTrainingStatus = cardConfig.illustTrainingStatus ?? true;
        result.limitBreakRank = cardConfig.limitBreakRank;
        result.skillLevel = cardConfig.skillLevel;
    } else {
        result.skillLevel = 1;
    }

    return result;
}

function toBuildResult(player: playerDetail, response: CalcResponse): buildResult {
    const result = new buildResult(response.songs.map((song) => {
        return {
            songId: song.songId,
            difficulty: song.difficulty,
        }
    }));
    result.totalScore = response.totalScore;
    result.totalStat = response.totalStat;

    const items = response.items ?? DEFAULT_ITEM_SELECTION;
    result.item[AreaItemType.band] = items.band;
    result.item[AreaItemType.attribute] = items.attribute;
    result.item[AreaItemType.magazine] = normalizeMagazine(items.magazine);

    for (const song of response.songs) {
        result.score.push(song.score);
        result.stat.push(song.stat);

        result.team.push(song.teamCardIds.map((cardId) => toCardInfo(cardId, player)));
        result.capital.push(toCardInfo(song.captainCardId, player));
    }

    return result;
}

async function requestRemoteCalcResult(
    playerId: number,
    player: playerDetail,
    server: Server,
    currentEvent: number,
): Promise<buildResult> {
    let response;
    try {
        response = await axios.post<ApiEnvelope>(optimizeCalcApiUrl, {
            playerId,
            server: Server[server],
            eventId: currentEvent,
        }, { timeout: Number(process.env.BANGDREAM_OPTIMIZE_TIMEOUT_MS) || 60000 });
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            const message = (error.response.data as Partial<ApiEnvelope>)?.message;
            const status = error.response.status;
            throw new Error(message ? `${status} ${message}` : `计算服务返回 ${status}`);
        }
        throw error;
    }

    const body = response.data;
    if (body.status !== 'ok' || !body.data) {
        throw new Error(body.message ?? '计算服务返回异常');
    }

    return toBuildResult(player, body.data);
}

function calcErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    return '内部错误';
}

router.post('',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('eventId').optional().isInt(), // eventId is optional and must be an integer if provided
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
        body('save').optional().isBoolean(),
        body('description').optional(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, eventId, useEasyBG, compress, save, description } = req.body;

        try {
            const result = await commandCalcResult(playerId, getServerByServerId(mainServer), useEasyBG, compress, eventId, save, description);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);


export async function commandCalcResult(playerId: number, mainServer: Server, useEasyBG: boolean, compress: boolean, eventId?: number, save?: boolean, description?: string)/*: Promise<Array<Buffer | string>>*/ {

    let player :playerDetail  = await playerDB.getPlayer(playerId)
    let currentEvent = player.currentEvent
    if (eventId) {
        currentEvent = eventId
    }
    if (!currentEvent) {
        currentEvent = getPresentEvent(mainServer).eventId
    }
    if (currentEvent != player.currentEvent) {
        player = await playerDB.updCurrentEvent(playerId, mainServer, currentEvent)
    }

    if (!save) {
        save = false
    }
    const output = [] 
    try {
        const res: buildResult = await requestRemoteCalcResult(playerId, player, mainServer, currentEvent)
        if (save) {
            res.description = description
            const saveRes = await resultDB.addResult(player.currentEvent, res)
            output.push(`上传成功，当前活动共有${saveRes.compositionList.length}个方案`)
        }
        output.push(...await drawResult(res, currentEvent, useEasyBG, compress))
    }
    catch(e) {
        return [calcErrorMessage(e)]
    }
    return output
}

export { router as calcResultRouter }
