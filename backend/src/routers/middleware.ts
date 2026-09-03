import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { beginHttpRequest } from '@/monitoring/memoryMonitor';

export const middleware = (req: Request, res: Response, next: NextFunction) => {
    const requestTime = Date.now();
    const requestMemory = process.memoryUsage();
    const timeString = new Date(requestTime).toString().split(' ')[4];
    const completeRequest = beginHttpRequest();
    let requestCompleted = false;
    const finishRequest = () => {
        if (requestCompleted) return;
        requestCompleted = true;
        completeRequest(res.statusCode >= 500);
        const responseTime = Date.now();
        const duration = responseTime - requestTime;
        const contentLength = Number(res.getHeader('content-length') ?? 0);
        const sizeMiB = Number.isFinite(contentLength) ? contentLength / 1024 / 1024 : 0;
        const responseMemory = process.memoryUsage();
        const toMiB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
        const memoryDelta = `rssΔ=${toMiB(responseMemory.rss - requestMemory.rss)}MB heapΔ=${toMiB(responseMemory.heapUsed - requestMemory.heapUsed)}MB externalΔ=${toMiB(responseMemory.external - requestMemory.external)}MB`;
        console.log(`[${timeString}] [Response] ${req.ip} ${req.baseUrl}${req.path} ${sizeMiB.toFixed(2)}MB ${duration}ms ${memoryDelta}`);
    };
    res.once('finish', finishRequest);
    res.once('close', finishRequest);
    // yyyy-MM-ddTHH:mm:ss
    if (process.env.DEBUG_REQUEST_BODY === 'true') {
        console.log(`[${timeString}] [Request] ${req.ip} ${req.baseUrl}${req.path}`, req.body);
    } else {
        console.log(`[${timeString}] [Request] ${req.ip} ${req.baseUrl}${req.path}`);
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log(`[${timeString}] [Validation Failed] ${req.ip} ${req.baseUrl}${req.path}`, errors.array());
        return res.status(400).send({ status: 'failed', data: `参数错误`, error: errors.array() });
    }

    next();
};
