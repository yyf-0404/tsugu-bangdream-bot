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
        body('id').optional().isInt(),
        body('useEasyBG').isBoolean(), // Validation for 'useEasyBG' field
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { mainServer, eventId, id, useEasyBG, compress } = req.body;

        try {
            const result = await commandSearchComposition(getServerByServerId(mainServer), useEasyBG, compress, eventId, id);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandSearchComposition(mainServer: Server, useEasyBG: boolean, compress: boolean, eventId?: number, id?: number)/*: Promise<Array<Buffer | string>>*/ {

    if (!eventId) {
        eventId = getPresentEvent(mainServer).eventId
    }
    if (!id) {
        id = 1
    }
    const event = new Event(eventId)
    if (event.eventType != 'medley') {
        return ['错误：活动序号' + eventId + '类型不是组曲']
    }
    const data = await resultDB.getEvent(eventId)
    if (data.compositionList.length == 0) {
        return [`当前活动未上传组队方案`]
    }
    const result = data.compositionList[id - 1]
    for (const team of result.team) {
        for (const info of team) {
            info.card = new Card(info.card.cardId)
        }
    }
    for (const info of result.capital) {
        info.card = new Card(info.card.cardId)
    }
    const res = []
    if (data.compositionList.length > 1) {
        res.push(`方案（${id}/${data.compositionList.length}）`)
    }
    res.push(...await drawResult(result, eventId, useEasyBG, compress))
    return res
}

export { router as searchCompositionRouter }