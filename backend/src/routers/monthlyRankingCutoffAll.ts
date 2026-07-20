import express from 'express';
import { body } from 'express-validator';
import { drawCutoffAll } from '@/view/cutoffAll';
import { Server, getServerByServerId } from '@/types/Server';
import { getPresentEvent } from '@/types/Event';
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import { drawMonthlyRankingCutoffAll } from "@/view/monthlyRankingCutoffAll";
import { getPresentMonthlyRanking } from "@/types/MonthlyRanking";

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('monthlyRankingId').optional().isInt(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { mainServer, monthlyRankingId, compress } = req.body;
        try {
            const result = await commandMonthlyRankingCutoffAll(getServerByServerId(mainServer), compress, monthlyRankingId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandMonthlyRankingCutoffAll(mainServer: Server, compress: boolean, monthlyRankingId?: number): Promise<Array<Buffer | string>> {

    if (!monthlyRankingId) {
        monthlyRankingId = getPresentMonthlyRanking(mainServer).monthlyRankingId
    }
    return drawMonthlyRankingCutoffAll(monthlyRankingId, mainServer, compress)

}

export { router as monthlyRankingCutoffAllRouter }
