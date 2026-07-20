import express from 'express';
import { body } from 'express-validator';
import { Request, Response } from 'express';
import { middleware } from '@/routers/middleware';
import { listToBase64 } from '@/routers/utils';
import { isServer, Server, getServerByServerId } from '@/types/Server';
import { getPresentMonthlyRanking } from '@/types/MonthlyRanking';
import { drawMonthlyRankingCutoffListOfRecentEvent } from '@/view/monthlyRankingCutoffListOfRecentEvent';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('tier').isInt(),
        body('monthlyRankingId').optional().isInt(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { mainServer, tier, monthlyRankingId, compress } = req.body;
        try {
            const result = await commandMonthlyRankingCutoffListOfRecentEvent(getServerByServerId(mainServer), tier, compress, monthlyRankingId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandMonthlyRankingCutoffListOfRecentEvent(mainServer: Server, tier: number, compress: boolean, monthlyRankingId?: number): Promise<Array<Buffer | string>> {
    if (!monthlyRankingId) {
        const presentMonthlyRanking = getPresentMonthlyRanking(mainServer);
        if (!presentMonthlyRanking) {
            return [`错误: 当前服务器没有可用月榜`];
        }
        monthlyRankingId = presentMonthlyRanking.monthlyRankingId;
    }
    return drawMonthlyRankingCutoffListOfRecentEvent(monthlyRankingId, tier, mainServer, compress);
}

export { router as monthlyRankingCutoffListOfRecentRouter };
