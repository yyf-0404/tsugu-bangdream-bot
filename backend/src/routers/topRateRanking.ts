import { Server, getServerByServerId } from '@/types/Server';
import { getPresentEvent } from '@/types/Event';
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { body } from 'express-validator';
import express from 'express';
import { drawTopRateRanking } from '@/view/cutoffEventTop';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post(
  '/',
  [
    body('mainServer').custom(isServer),
    body('length').optional().isInt(),
    body('date').optional().isInt(),
    body('compareTier').optional().isInt(),
    body('compareUid').optional().isInt(),
    body('compress').optional().isBoolean(),
  ],
  middleware,
  async (req: Request, res: Response) => {

    const { mainServer, length, date, compareTier, compareUid, compress } = req.body;

    try {
      const result = await commandTopSpeedRanking(getServerByServerId(mainServer), compress, length, date ? new Date(date) : undefined, compareTier, compareUid);
      res.send(listToBase64(result));
    } catch (e) {
      console.log(e);
      res.status(500).send({ status: 'failed', data: '内部错误' });
    }
  }
);

export async function commandTopSpeedRanking(mainServer: Server, compress: boolean, time = 60, date: Date, compareTier?: number, comparePlayerUid?: number): Promise<Array<Buffer | string>> {
  const targetTime = new Date(date);
  const eventId = getPresentEvent(mainServer, +targetTime).eventId
  return await drawTopRateRanking(eventId, mainServer, compress, time, date, compareTier, comparePlayerUid);
}

export { router as topRateRankingRouter };
