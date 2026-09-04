import { PerformanceObserver } from 'node:perf_hooks';
import * as v8 from 'node:v8';
import { logger } from '@/logger';
import { getLinuxMemorySnapshot } from '@/monitoring/linuxMemory';

type Completion = (failed?: boolean) => void;

const runtimeMetrics = {
    http: { active: 0, peakActive: 0, total: 0, failed: 0 },
    imageRender: {
        active: 0,
        peakActive: 0,
        total: 0,
        failed: 0,
        outputBytes: 0,
        peakPixels: 0,
        lastWidth: 0,
        lastHeight: 0,
    },
    chart: { active: 0, peakActive: 0, total: 0, destroyed: 0, failed: 0, instances: 0 },
    canvasRelease: { total: 0, failed: 0, releasedPixels: 0 },
    cache: { avatarEntries: 0, assetEntries: 0, assetBytes: 0 },
};

let monitorStop: (() => void) | undefined;

function begin(metric: { active: number; peakActive: number; total: number; failed: number }): Completion {
    metric.active += 1;
    metric.total += 1;
    metric.peakActive = Math.max(metric.peakActive, metric.active);
    let completed = false;
    return (failed = false) => {
        if (completed) return;
        completed = true;
        metric.active = Math.max(0, metric.active - 1);
        if (failed) metric.failed += 1;
    };
}

export function beginHttpRequest(): Completion {
    return begin(runtimeMetrics.http);
}

export function beginImageRender(width: number, height: number): (failed?: boolean, outputBytes?: number) => void {
    runtimeMetrics.imageRender.lastWidth = width;
    runtimeMetrics.imageRender.lastHeight = height;
    runtimeMetrics.imageRender.peakPixels = Math.max(runtimeMetrics.imageRender.peakPixels, width * height);
    const complete = begin(runtimeMetrics.imageRender);
    return (failed = false, outputBytes = 0) => {
        runtimeMetrics.imageRender.outputBytes += outputBytes;
        complete(failed);
    };
}

export function beginChartRender(): Completion {
    return begin(runtimeMetrics.chart);
}

export function recordChartDestroyed(instanceCount: number): void {
    runtimeMetrics.chart.destroyed += 1;
    runtimeMetrics.chart.instances = instanceCount;
}

export function recordCanvasReleased(width: number, height: number, failed = false): void {
    runtimeMetrics.canvasRelease.total += 1;
    runtimeMetrics.canvasRelease.releasedPixels += width * height;
    if (failed) runtimeMetrics.canvasRelease.failed += 1;
}

export function recordAvatarCacheEntry(): void {
    runtimeMetrics.cache.avatarEntries += 1;
}

export function recordAssetCacheEntry(bytes: number): void {
    runtimeMetrics.cache.assetEntries += 1;
    runtimeMetrics.cache.assetBytes += bytes;
}

function bytesToMiB(bytes: number): number {
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function getActiveCount(methodName: '_getActiveHandles' | '_getActiveRequests'): number | undefined {
    const method = (process as any)[methodName];
    if (typeof method !== 'function') return undefined;
    try {
        return method.call(process).length;
    } catch {
        return undefined;
    }
}

function getActiveResourceSummary(): Record<string, number> | undefined {
    if (typeof process.getActiveResourcesInfo !== 'function') return undefined;
    const summary: Record<string, number> = {};
    for (const resource of process.getActiveResourcesInfo()) {
        summary[resource] = (summary[resource] ?? 0) + 1;
    }
    return summary;
}

export function startMemoryMonitor(): () => void {
    if (monitorStop) return monitorStop;
    if (process.env.MEMORY_MONITOR === 'false') return () => undefined;

    const configuredInterval = Number(process.env.MEMORY_MONITOR_INTERVAL_MS ?? 60000);
    const intervalMs = Number.isFinite(configuredInterval) ? Math.max(5000, configuredInterval) : 60000;
    let previousRss = process.memoryUsage().rss;
    let peakRss = previousRss;
    let gcCount = 0;
    let gcDurationMs = 0;

    const gcObserver = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
            gcCount += 1;
            gcDurationMs += entry.duration;
        }
    });
    try {
        gcObserver.observe({ entryTypes: ['gc'] });
    } catch (error) {
        logger('MemoryMonitor', `GC observer unavailable: ${error}`);
    }

    const sample = () => {
        const memory = process.memoryUsage();
        const heap = v8.getHeapStatistics();
        peakRss = Math.max(peakRss, memory.rss);
        const snapshot = {
            rssMiB: bytesToMiB(memory.rss),
            rssDeltaMiB: bytesToMiB(memory.rss - previousRss),
            peakRssMiB: bytesToMiB(peakRss),
            heapUsedMiB: bytesToMiB(memory.heapUsed),
            heapTotalMiB: bytesToMiB(memory.heapTotal),
            externalMiB: bytesToMiB(memory.external),
            arrayBuffersMiB: bytesToMiB(memory.arrayBuffers),
            mallocedMiB: bytesToMiB(heap.malloced_memory),
            peakMallocedMiB: bytesToMiB(heap.peak_malloced_memory),
            nativeContexts: heap.number_of_native_contexts,
            detachedContexts: heap.number_of_detached_contexts,
            activeHandles: getActiveCount('_getActiveHandles'),
            activeRequests: getActiveCount('_getActiveRequests'),
            activeResources: getActiveResourceSummary(),
            gc: {
                count: gcCount,
                durationMs: Math.round(gcDurationMs * 100) / 100,
            },
            linux: getLinuxMemorySnapshot(),
            runtime: runtimeMetrics,
        };
        previousRss = memory.rss;
        gcCount = 0;
        gcDurationMs = 0;
        logger('MemoryMonitor', JSON.stringify(snapshot));
    };

    sample();
    const timer = setInterval(sample, intervalMs);
    timer.unref();

    monitorStop = () => {
        clearInterval(timer);
        gcObserver.disconnect();
        monitorStop = undefined;
    };
    return monitorStop;
}
