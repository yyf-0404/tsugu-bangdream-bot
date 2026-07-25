export interface CutoffRatePoint {
    time: number;
    ep: number;
}

export const CURRENT_RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Calculates the average hourly gain over the latest rolling window.
 *
 * The point at or immediately before the window boundary is used as the
 * baseline. When the available history is shorter than the requested window,
 * the first valid point is used and the rate is normalized by the actual
 * elapsed time.
 */
export function calculateCurrentHourlyRate(
    points: CutoffRatePoint[],
    windowMs = CURRENT_RATE_WINDOW_MS,
): number | null {
    if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(windowMs) || windowMs <= 0) {
        return null;
    }

    const validPoints = points
        .filter(point => Number.isFinite(point?.time) && Number.isFinite(point?.ep))
        .sort((a, b) => a.time - b.time);

    if (validPoints.length < 2) {
        return null;
    }

    const latest = validPoints[validPoints.length - 1];
    const targetTime = latest.time - windowMs;
    let baseline = validPoints[0];

    for (let i = validPoints.length - 2; i >= 0; i--) {
        if (validPoints[i].time <= targetTime) {
            baseline = validPoints[i];
            break;
        }
    }

    const elapsedHours = (latest.time - baseline.time) / (60 * 60 * 1000);
    if (!Number.isFinite(elapsedHours) || elapsedHours <= 0) {
        return null;
    }

    const rate = (latest.ep - baseline.ep) / elapsedHours;
    if (!Number.isFinite(rate)) {
        return null;
    }

    return Math.max(0, rate);
}
