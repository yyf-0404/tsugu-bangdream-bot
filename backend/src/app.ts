import express from 'express';
import { gachaSimulateRouter } from '@/routers/gachaSimulate';
import { cardIllustrationRouter } from '@/routers/getCardIllustration';
import { roomListRouter } from '@/routers/roomList';
import { searchCardRouter } from '@/routers/searchCard';
import { searchCharacterRouter } from '@/routers/searchCharacter';
import { searchEventRouter } from '@/routers/searchEvent';
import { searchMonthlyRankingRouter } from '@/routers/searchMonthlyRanking';
import { searchGachaRouter } from '@/routers/searchGacha';
import { searchPlayerRouter } from '@/routers/searchPlayer';
import { searchSongRouter } from '@/routers/searchSong';
import { songMetaRouter } from '@/routers/songMeta';
import { cutoffDetailRouter } from '@/routers/cutoffDetail';
import { cutoffListOfRecentEventRouter } from '@/routers/cutoffListOfEvent';
import { cutoffAllRouter } from '@/routers/cutoffAll';
import { cutOffMusicRouter } from '@/routers/cutOffMusic';
import { monthlyRankingCutoffDetailRouter } from '@/routers/monthlyRankingCutoffDetail';
import { monthlyRankingCutoffListOfRecentRouter } from '@/routers/monthlyRankingCutoffListOfRecent';
import { monthlyRankingCutoffAllRouter } from '@/routers/monthlyRankingCutoffAll';
import { songChartRouter } from '@/routers/songChart';
import { userRouter } from '@/routers/user'
import { stationRouter } from '@/routers/station'
import { eventPreviewRouter } from '@/routers/article/eventPreview'
import { eventReportRouter } from '@/routers/article/eventReport'
import { eventStageRouter } from '@/routers/eventStage'
import { songRandomRouter } from '@/routers/songRandom'
import { fuzzySearchRouter } from '@/routers/fuzzySearch'
import { teamBuildDetailRouter } from '@/routers/teamBuildDetail'
import { calcResultRouter } from './routers/calcResult';
import { topRateDetailRouter } from '@/routers/topRateDetail';
import { topPointStatRouter } from '@/routers/topPointStat';
import { topRateRankingRouter } from '@/routers/topRateRanking';
import { topTenMinuteSpeedRouter } from '@/routers/topTenMinuteSpeed';
import { searchCompositionRouter } from '@/routers/searchComposition';

import { logger } from '@/logger'
import * as dotenv from 'dotenv';
import { startMemoryMonitor } from '@/monitoring/memoryMonitor';


dotenv.config();
startMemoryMonitor();


const app = express();

app.use(express.json());

app.use('/gachaSimulate', gachaSimulateRouter);
app.use('/getCardIllustration', cardIllustrationRouter);
app.use('/roomList', roomListRouter);
app.use('/searchCard', searchCardRouter);
app.use('/searchCharacter', searchCharacterRouter);
app.use('/searchEvent', searchEventRouter);
app.use('/searchMonthlyRanking', searchMonthlyRankingRouter);
app.use('/searchGacha', searchGachaRouter);
app.use('/searchPlayer', searchPlayerRouter);
app.use('/searchSong', searchSongRouter);
app.use('/songMeta', songMetaRouter);
app.use('/songChart', songChartRouter);
app.use('/cutoffDetail', cutoffDetailRouter);
app.use('/cutoffListOfRecentEvent', cutoffListOfRecentEventRouter);
app.use('/cutoffAll', cutoffAllRouter)
app.use('/monthlyRankingCutoffDetail', monthlyRankingCutoffDetailRouter);
app.use('/monthlyRankingCutoffListOfRecent', monthlyRankingCutoffListOfRecentRouter);
app.use('/monthlyRankingCutoffAll', monthlyRankingCutoffAllRouter);
app.use('/cutOffMusic', cutOffMusicRouter);
app.use('/eventStage', eventStageRouter)
app.use('/songRandom', songRandomRouter);
app.use('/fuzzySearch', fuzzySearchRouter);
app.use('/teamBuildDetail', teamBuildDetailRouter);
app.use('/calcResult', calcResultRouter);
app.use('/topRateDetail', topRateDetailRouter);
app.use('/topPointStat', topPointStatRouter);
app.use('/topRateRanking', topRateRankingRouter);
app.use('/topTenMinuteSpeed', topTenMinuteSpeedRouter);
app.use('/searchComposition', searchCompositionRouter)

// console.log(process.env)
if (process.env.LOCAL_DB == 'true') {
    app.use('/user', userRouter);
    app.use('/station', stationRouter);
}
else {
    app.use('/user', (req, res) => {
        res.status(404).send({
            status: 'fail',
            data: '错误: 服务器未启用数据库'
        });
    });
    app.use('/station', (req, res) => {
        res.status(404).send({
            status: 'fail',
            data: '错误: 服务器未启用数据库'
        });
    });
}
if (process.env.ARTICLE == 'true') {
    app.use('/eventPreview', eventPreviewRouter);
    app.use('/eventReport', eventReportRouter);
}

const port: number = parseInt(process.env.BACKEND_PORT || '3000');

if (isNaN(port)) {
    logger('expressMainThread', 'port is not a number');
    process.exit(1);
}

//404
app.use((req, res) => {
    res.status(404).send('404 Not Found');
});

app.listen(port, () => {
    logger(`expressMainThread`, `listening on port ${port}`);
});
