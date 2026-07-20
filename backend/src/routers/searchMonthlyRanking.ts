import express from 'express';
import { body } from 'express-validator';
import { fuzzySearch, FuzzySearchResult, isFuzzySearchResult } from '@/fuzzySearch';
import { isInteger, listToBase64, parseSearchDate } from '@/routers/utils';
import { isServerList, Server } from '@/types/Server';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';
import {
    getMonthlyRankingListByIdRange,
    getMonthlyRankingListByTimeRange,
    getPresentMonthlyRanking,
    MonthlyRanking,
    sortMonthlyRankingList,
} from '@/types/MonthlyRanking';
import mainAPI from '@/types/_Main';
import { drawMonthlyRankingDetail } from '@/view/monthlyRankingDetail';
import { drawMonthlyRankingList } from '@/view/monthlyRankingList';

const router = express.Router();

router.post(
    '/',
    [
        body('displayedServerList').custom(isServerList),
        body('fuzzySearchResult').optional().custom(isFuzzySearchResult),
        body('text').optional().isString(),
        body('compress').optional().isBoolean(),
        body('useEasyBG').isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { displayedServerList, fuzzySearchResult, text, compress, useEasyBG } = req.body;

        if (text && fuzzySearchResult) {
            res.status(422).json({ status: 'failed', data: 'text 与 fuzzySearchResult 不能同时存在' });
            return;
        }
        if (!text && !fuzzySearchResult) {
            res.status(422).json({ status: 'failed', data: '不能同时不存在 text 与 fuzzySearchResult' });
            return;
        }

        try {
            const result = await commandMonthlyRanking(displayedServerList, text || fuzzySearchResult, compress, useEasyBG);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandMonthlyRanking(
    displayedServerList: Server[],
    input: string | FuzzySearchResult,
    compress: boolean,
    useEasyBG: boolean
): Promise<Array<Buffer | string>> {
    let fuzzySearchResult: FuzzySearchResult;

    if (typeof input === 'string') {
        const normalized = input.trim();

        if (/^(当前月榜|当前|present|current|now)$/i.test(normalized)) {
            const presentMonthlyRanking = displayedServerList
                .map((server) => getPresentMonthlyRanking(server))
                .find((item): item is MonthlyRanking => item != null);

            if (!presentMonthlyRanking) {
                return ['没有找到当前月榜'];
            }

            return await drawMonthlyRankingDetail(presentMonthlyRanking.monthlyRankingId, displayedServerList, compress, useEasyBG);
        }

        const dateRange = parseSearchDate(normalized);
        if (dateRange) {
            const tempMonthlyRankingList = getMonthlyRankingListByTimeRange(dateRange.rangeStart, dateRange.rangeEnd, displayedServerList);
            if (tempMonthlyRankingList.length == 0) {
                return ['没有搜索到符合条件的月榜'];
            }
            sortMonthlyRankingList(tempMonthlyRankingList);
            return await drawMonthlyRankingList(tempMonthlyRankingList, displayedServerList, compress, useEasyBG);
        }

        const idRangeMatch = normalized.match(/^([<>])\s*(\d+)$/) || normalized.match(/^(\d+)\s*[-~]\s*(\d+)$/);
        if (idRangeMatch) {
            const tempMonthlyRankingList = getMonthlyRankingListByIdRangeFromInput(normalized);
            if (tempMonthlyRankingList.length == 0) {
                return ['没有搜索到符合条件的月榜'];
            }
            return await drawMonthlyRankingList(tempMonthlyRankingList, displayedServerList, compress, useEasyBG);
        }

        if (isInteger(normalized)) {
            const monthlyRanking = new MonthlyRanking(parseInt(normalized));
            if (!monthlyRanking.isExist) {
                return ['没有搜索到该月榜'];
            }
            return await drawMonthlyRankingDetail(monthlyRanking.monthlyRankingId, displayedServerList, compress, useEasyBG);
        }

        fuzzySearchResult = fuzzySearch(normalized);
    } else {
        fuzzySearchResult = input;
    }

    if (Object.keys(fuzzySearchResult).length == 0) {
        return ['错误: 没有有效的关键词'];
    }

    const keyword = String(fuzzySearchResult['_all']?.[0] ?? '').trim().toLowerCase();
    const monthlyRankingIdList = Object.keys(((mainAPI as any)['monthlyRanking']) ?? {}).map(Number);
    const tempMonthlyRankingList = monthlyRankingIdList
        .map((monthlyRankingId) => new MonthlyRanking(monthlyRankingId))
        .filter((monthlyRanking) => monthlyRanking.isExist && matchMonthlyRankingKeyword(monthlyRanking, keyword));

    if (tempMonthlyRankingList.length == 0) {
        return ['没有搜索到符合条件的月榜'];
    }

    sortMonthlyRankingList(tempMonthlyRankingList, displayedServerList);
    return await drawMonthlyRankingList(tempMonthlyRankingList, displayedServerList, compress, useEasyBG);
}

function matchMonthlyRankingKeyword(monthlyRanking: MonthlyRanking, keyword: string): boolean {
    if (!keyword) return true;
    const name = monthlyRanking.monthlyRankingName.filter(Boolean).join(' ').toLowerCase();
    const bundle = monthlyRanking.assetBundleName.toLowerCase();
    return name.includes(keyword) || bundle.includes(keyword) || monthlyRanking.monthlyRankingId.toString().includes(keyword);
}

function getMonthlyRankingListByIdRangeFromInput(input: string): MonthlyRanking[] {
    const relationMatch = input.match(/^([<>])\s*(\d+)$/);
    if (relationMatch) {
        const value = parseInt(relationMatch[2], 10);
        return getMonthlyRankingListByIdRange(relationMatch[1] === '>' ? value + 1 : undefined, relationMatch[1] === '<' ? value - 1 : undefined);
    }
    return getMonthlyRankingListByIdRangeFromRangeInput(input);
}

function getMonthlyRankingListByIdRangeFromRangeInput(input: string): MonthlyRanking[] {
    const rangeMatch = input.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (!rangeMatch) return [];
    const start = Math.min(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10));
    const end = Math.max(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10));
    return getMonthlyRankingListByIdRange(start, end);
}

export { router as searchMonthlyRankingRouter };
