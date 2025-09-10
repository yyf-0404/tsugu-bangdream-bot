import { Server } from "@/types/Server";
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { getServerByServerId } from '@/types/Server';
import { compositionResultDB } from "@/database/compositionResultDB";
import express from 'express';
import { body } from 'express-validator'; // Import express-validator functions
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { Event, getPresentEvent } from '@/types/Event';
import { drawResult } from "@/view/calcResult";
import { Card } from "@/types/Card";

const router = express.Router();
const resultDB = new compositionResultDB(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/', 'tsugu-bangdream-bot')

router.post('/',
    [
        body('mainServer').custom(isServer), // Custom validation for 'server' field
        body('eventId').optional().isInt(), // eventId is optional and must be an integer if provided
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { mainServer, eventId, useEasyBG, compress } = req.body;

        try {
            const result = await commandSearchComposition(getServerByServerId(mainServer), useEasyBG, compress, eventId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandSearchComposition(mainServer: Server, useEasyBG: boolean, compress: boolean, eventId?: number)/*: Promise<Array<Buffer | string>>*/ {

    if (!eventId) {
        eventId = getPresentEvent(mainServer).eventId
    }
    const event = new Event(eventId)
    if (event.eventType != 'medley') {
        return ['错误：活动序号' + eventId + '类型不是组曲']
    }
    const data = await resultDB.getEvent(eventId)
    if (data.compositionList.length == 0) {
        return [`当前活动未上传组队方案`]
    }
    const result = data.compositionList[0]
    for (const team of result.team) {
        for (const info of team) {
            info.card = new Card(info.card.cardId)
        }
    }
    for (const info of result.capital) {
        info.card = new Card(info.card.cardId)
    }
    return await drawResult(data.compositionList[0], eventId, useEasyBG, compress)
}

export { router as searchCompositionRouter }