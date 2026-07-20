import express from 'express';
import { body } from 'express-validator';
import { Request, Response } from 'express';
import { middleware } from '@/routers/middleware';
import { listToBase64 } from '@/routers/utils';
import { isServer, Server, getServerByServerId } from '@/types/Server';
import { getPresentEvent } from '@/types/Event';
import { Event } from '@/types/Event';
import { Song } from '@/types/Song';
import { serverNameFullList } from '@/config';
import { drawMusicRankingCutoffDetail } from '@/view/musicRankingCutoffDetail';
import { drawMusicRankingCutoffTop } from '@/view/musicRankingCutoffTop';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('tier').isInt(),
        body('eventId').optional().isInt(),
        body('music').exists(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { mainServer, tier, eventId, music, compress } = req.body;
        try {
            const result = await commandCutOffMusic(
                getServerByServerId(mainServer),
                tier,
                compress,
                music,
                eventId
            );
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

async function resolveMusicId(event: Event, server: Server, alias: string): Promise<number | null> {
    const lowerAlias = alias.toLowerCase().trim();
    const musics = event.musics?.[server];
    if (!musics || musics.length === 0) return null;

    const matches: number[] = [];
    for (const music of musics) {
        const song = new Song(music.musicId);
        if (!song.isExist) continue;

        for (const title of song.musicTitle) {
            if (title && title.toLowerCase().includes(lowerAlias)) {
                matches.push(music.musicId);
                break;
            }
        }

        if (song.nickname) {
            for (const nick of song.nickname.split(',')) {
                if (nick.trim().toLowerCase() === lowerAlias || nick.trim().toLowerCase().includes(lowerAlias)) {
                    if (!matches.includes(music.musicId)) {
                        matches.push(music.musicId);
                    }
                    break;
                }
            }
        }
    }

    if (matches.length === 0) return null;
    return matches[0];
}

export async function commandCutOffMusic(
    mainServer: Server,
    tier: number,
    compress: boolean,
    music: number | string,
    eventId?: number
): Promise<Array<Buffer | string>> {
    if (!tier) {
        return ['请输入排名'];
    }
    if (!music) {
        return ['请输入歌曲ID或别名'];
    }
    if (!eventId) {
        eventId = getPresentEvent(mainServer).eventId;
    }

    const event = new Event(eventId);
    if (!event.isExist) {
        return [`错误: 活动${eventId}不存在`];
    }
    await event.initFull();
    if (!event.musics?.[mainServer] || event.musics[mainServer].length === 0) {
        return [`错误: 活动${eventId}在${serverNameFullList[mainServer]}没有歌榜数据`];
    }

    let resolvedMusicId: number;
    if (typeof music === 'number') {
        resolvedMusicId = music;
    } else {
        const resolved = await resolveMusicId(event, mainServer, music);
        if (resolved === null) {
            return [`错误: 未在活动歌曲中匹配到 "${music}"`];
        }
        resolvedMusicId = resolved;
    }

    if (tier == 10) {
        return await drawMusicRankingCutoffTop(eventId, mainServer, compress, resolvedMusicId);
    }
    return await drawMusicRankingCutoffDetail(eventId, tier, mainServer, compress, resolvedMusicId);
}

export { router as cutOffMusicRouter };
