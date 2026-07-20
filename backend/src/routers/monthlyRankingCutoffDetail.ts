import express from 'express';
import { body } from 'express-validator';
import { Request, Response } from 'express';
import { middleware } from '@/routers/middleware';
import { listToBase64 } from '@/routers/utils';
import { isServer, Server, getServerByServerId } from '@/types/Server';
import { getPresentMonthlyRanking } from '@/types/MonthlyRanking';
import { drawMonthlyRankingCutoffDetail } from '@/view/monthlyRankingCutoffDetail';
import { drawMonthlyRankingCutoffEventTop } from '@/view/monthlyRankingCutoffEventTop';

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
            const result = await commandMonthlyRankingCutoffDetail(getServerByServerId(mainServer), tier, compress, monthlyRankingId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandMonthlyRankingCutoffDetail(mainServer: Server, tier: number, compress: boolean, monthlyRankingId?: number): Promise<Array<Buffer | string>> {
    if (!tier) {
        return ['请输入排名'];
    }
    if (!monthlyRankingId) {
        const presentMonthlyRanking = getPresentMonthlyRanking(mainServer);
        if (!presentMonthlyRanking) {
            return [`错误: ${mainServer} 当前没有可用月榜`];
        }
        monthlyRankingId = presentMonthlyRanking.monthlyRankingId;
    }
    if (tier == 10) {
        return await drawMonthlyRankingCutoffEventTop(monthlyRankingId, mainServer, compress);
    }
    return await drawMonthlyRankingCutoffDetail(monthlyRankingId, tier, mainServer, compress);
}

export { router as monthlyRankingCutoffDetailRouter };
