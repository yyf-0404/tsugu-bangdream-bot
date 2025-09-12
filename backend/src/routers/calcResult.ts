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
import { buildResult } from "@/teamBuilder/types"
import { dataPrepare } from "@/teamBuilder/dataPrepare";
import { drawResult } from "@/view/calcResult";
import { compositionResultDB } from "@/database/compositionResultDB";

const router = express.Router();
const playerDB = new PlayerDB(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/', 'tsugu-bangdream-bot')
const resultDB = new compositionResultDB(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/', 'tsugu-bangdream-bot')
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
    const res: buildResult = await dataPrepare(player, mainServer)
    res.print()
    const output = []
    if (save) {
        res.description = description
        const saveRes = await resultDB.addResult(player.currentEvent, res)
        output.push(`上传成功，当前活动共有${saveRes.compositionList.length}个方案`)
    }
    output.push(...await drawResult(res, currentEvent, useEasyBG, compress))
    return output
}

export { router as calcResultRouter }