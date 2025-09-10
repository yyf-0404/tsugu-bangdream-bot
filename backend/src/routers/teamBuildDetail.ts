import { Server } from "@/types/Server";
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { getServerByServerId } from '@/types/Server';
import { PlayerDB } from "@/database/playerDB";
import { playerDetail } from "@/teamBuilder/types";
import express from 'express';
import { body } from 'express-validator'; // Import express-validator functions
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { getPresentEvent } from '@/types/Event';
import { drawTeamBuildDetail } from "@/view/teamBuildDetail";
import { Player } from "@/types/Player";
import { Stat, Card, addStat, emptyStat } from "@/types/Card";
import { fuzzySearch } from "@/fuzzySearch";
import { matchCardList } from "@/view/cardList";
import mainAPI from "@/types/_Main";
import { AreaItem } from "@/types/AreaItem";

const router = express.Router();
const playerDB = new PlayerDB(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/', 'tsugu-bangdream-bot')

router.post('/',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('eventId').optional().isInt(), // eventId is optional and must be an integer if provided
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, eventId, useEasyBG, compress } = req.body;

        try {
            const result = await commandTeamBuildDetail(playerId, getServerByServerId(mainServer), useEasyBG, compress, eventId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

router.post('/importPlayerData',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, useEasyBG, compress } = req.body;
        const player = new Player(playerId, mainServer)
        await player.initFull(false, 3)
        if (player.initError) {
            //使用缓存查询，如果失败则返回失败
            await player.initFull(false, 0)
            if (player.initError || !player.isExist) {
                res.send(listToBase64([`错误: 查询玩家时发生错误`]));
                return
            }
        }

        const cardList = player.profile.mainDeckUserSituations.entries.map((card) => {
            return {
                id: card.situationId,
                illustTrainingStatus: card.illust == "after_training",
                limitBreakRank: card.limitBreakRank,
                skillLevel: card.skillLevel
            }
        })
        await playerDB.addCard(playerId, cardList)

        const characterBounsList = player.profile.mainDeckUserSituations.entries.map((data) => {
            const card = new Card(data.situationId), append = data.userAppendParameter
            const base: Stat = {
                performance: append.performance,
                technique: append.technique,
                visual: append.visual
            }
            addStat(base, card.stat[card.getMaxLevel().toString()])
            const potential: Stat = {
                performance: Math.ceil(1000 * (append.characterPotentialPerformance || 0) / base.performance) / 1000,
                technique: Math.ceil(1000 * (append.characterPotentialTechnique || 0) / base.technique) / 1000,
                visual: Math.ceil(1000 * (append.characterPotentialVisual || 0) / base.visual) / 1000,
            }, characterTask: Stat = {
                performance: Math.ceil(1000 * (append.characterBonusPerformance || 0) / base.performance) / 1000,
                technique: Math.ceil(1000 * (append.characterBonusTechnique || 0) / base.technique) / 1000,
                visual: Math.ceil(1000 * (append.characterBonusVisual || 0) / base.visual) / 1000,
            }
            return {
                characterId: card.characterId,
                potential,
                characterTask
            }
        })
        await playerDB.updateCharacterBouns(playerId, characterBounsList)

        if (!player.profile.enabledUserAreaItems) {
            res.send(listToBase64(['无法获取区域道具信息，请公开显示主乐队综合能力']))
            return
        }
        const areaItemList = player.profile.enabledUserAreaItems.entries.map((item) => {
            return {
                id: item.areaItemCategory,
                level: item.level
            }
        })
        await playerDB.updateAreaItem(playerId, areaItemList)

        try {
            const result = await commandTeamBuildDetail(playerId, getServerByServerId(mainServer), useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
)

router.post('/updateSong',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
        body('id').isInt(),
        body('songId').isInt(),
        body('difficulty').isInt()
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, useEasyBG, compress, id, songId, difficulty } = req.body;
        let player: playerDetail = await playerDB.getPlayer(playerId)
        const eventId = player?.currentEvent
        if (!eventId) {
            res.send(listToBase64['未选择活动，请发送 组队计算+活动id'])
            return
        }
        await playerDB.updateSong(playerId, eventId, id, songId, difficulty)
        try {
            const result = await commandTeamBuildDetail(playerId, getServerByServerId(mainServer), useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
)


router.post('/resetSong',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean()
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, useEasyBG, compress } = req.body;
        let player: playerDetail = await playerDB.getPlayer(playerId)
        const eventId = player?.currentEvent
        if (!eventId) {
            res.send(listToBase64['未选择活动，请发送 组队计算+活动id'])
            return
        }
        await playerDB.resetSong(playerId, mainServer, eventId)
        try {
            const result = await commandTeamBuildDetail(playerId, getServerByServerId(mainServer), useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
)

router.post('/levelUp',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, useEasyBG, compress } = req.body;

        const areaItemList = Object.keys(mainAPI['areaItems']).map((areaItemId) => {
            const item = new AreaItem(parseInt(areaItemId))
            return {
                id: areaItemId,
                level: item.level[mainServer]
            }
        })
        await playerDB.updateAreaItem(playerId, areaItemList)

        const characterBounsList = Object.keys(mainAPI['characters']).map((characterId) => {
            return {
                characterId,
                potential: {
                    performance: 0.05,
                    technique: 0.05,
                    visual: 0.05
                },
                characterTask: {
                    performance: 0.06,
                    technique: 0.06,
                    visual: 0.06
                }
            }
        })
        await playerDB.updateCharacterBouns(playerId, characterBounsList)

        try {
            const result = await commandTeamBuildDetail(playerId, getServerByServerId(mainServer), useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
)

router.post('/levelReset',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, useEasyBG, compress } = req.body;

        const areaItemList = Object.keys(mainAPI['areaItems']).map((areaItemId) => {
            const item = new AreaItem(parseInt(areaItemId))
            return {
                id: areaItemId,
                level: 0
            }
        })
        await playerDB.updateAreaItem(playerId, areaItemList)

        const characterBounsList = Object.keys(mainAPI['characters']).map((characterId) => {
            return {
                characterId,
                potential: emptyStat(),
                characterTask: emptyStat()
            }
        })
        await playerDB.updateCharacterBouns(playerId, characterBounsList)

        try {
            const result = await commandTeamBuildDetail(playerId, getServerByServerId(mainServer), useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
)

router.post('/addCard',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
        body('skill_level').isInt(),
        body('break_rank').isInt(),
        body('text').isString(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, useEasyBG, compress, skill_level, break_rank, text } = req.body;

        const cardList = matchCardList(fuzzySearch(text), [3, 0]).map((card) => {
            return {
                id : card.cardId,
                illustTrainingStatus: true,
                limitBreakRank: break_rank,
                skillLevel: skill_level
            }
        })
        await playerDB.addCard(playerId, cardList)

        try {
            const result = await commandTeamBuildDetail(playerId, getServerByServerId(mainServer), useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
)

router.post('/delCard',
    [
        body('playerId').isInt(), // Validation for 'playerId' field
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
        body('text').isString(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { playerId, mainServer, useEasyBG, compress, text } = req.body;
        const cardList = matchCardList(fuzzySearch(text), [3, 0]).map((card) => {
            return card.cardId
        })
        await playerDB.delCard(playerId, cardList)

        try {
            const result = await commandTeamBuildDetail(playerId, getServerByServerId(mainServer), useEasyBG, compress);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
)



export async function commandTeamBuildDetail(playerId: number, mainServer: Server, useEasyBG: boolean, compress: boolean, eventId?: number)/*: Promise<Array<Buffer | string>>*/ {
    let player :playerDetail  = await playerDB.getPlayer(playerId)
    var currentEvent = player.currentEvent
    if (eventId) {
        currentEvent = eventId
    }
    if (!currentEvent) {
        currentEvent = getPresentEvent(mainServer).eventId
    }
    if (currentEvent != player.currentEvent) {
        player = await playerDB.updCurrentEvent(playerId, mainServer, currentEvent)
    }
    return await drawTeamBuildDetail(player, mainServer, useEasyBG, compress)
}


export { router as teamBuildDetailRouter }