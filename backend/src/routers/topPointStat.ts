import { Server, getServerByServerId } from '@/types/Server';
import { getPresentEvent } from '@/types/Event';
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { body } from 'express-validator';
import express from 'express';
import { drawTopPointStat } from '@/view/cutoffEventTop';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('eventId').optional().isInt(),
        body('playerId').optional().isInt(),
        body('tier').optional().isInt(),
        body('limit').optional().isString(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { mainServer, eventId, playerId, tier, limit, compress } = req.body;

        try {
            const result = await commandTopPointStat(getServerByServerId(mainServer), eventId, playerId, tier, compress, limit);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandTopPointStat(mainServer: Server, eventId: number, playerId: number, tier: number, compress: boolean, limit: string): Promise<Array<Buffer | string>> {
    if (!playerId && !tier) {
        return ['请输入玩家id或排名']
    }
    eventId ||= getPresentEvent(mainServer).eventId
    return await drawTopPointStat(eventId, playerId, tier, limit, mainServer, compress)
}

export { router as topPointStatRouter }
