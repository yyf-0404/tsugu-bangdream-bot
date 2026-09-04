import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { Canvas } from 'skia-canvas';
import { getLinuxMemorySnapshot } from '../monitoring/linuxMemory';

const scenarios = [
    'baseline',
    'create',
    'draw',
    'encode',
    'encode-sync',
    'compose-final-only',
    'compose-all',
    'compose-all-sync',
] as const;
type Scenario = typeof scenarios[number];

interface ProbeOptions {
    scenario?: Scenario;
    width: number;
    height: number;
    iterations: number;
    sources: number;
}

interface TrimAddon {
    trim(): boolean;
}

const finalization = {
    created: 0,
    finalized: 0,
};

const FinalizationRegistryConstructor = (globalThis as any).FinalizationRegistry;
const WeakRefConstructor = (globalThis as any).WeakRef;
const registry = FinalizationRegistryConstructor
    ? new FinalizationRegistryConstructor(() => { finalization.finalized += 1; })
    : undefined;

function numberArgument(name: string, fallback: number, minimum: number, maximum: number): number {
    const prefix = `--${name}=`;
    const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function parseOptions(): ProbeOptions {
    const scenarioName = process.argv.find((argument) => argument.startsWith('--scenario='))?.split('=')[1];
    const scenario = scenarios.includes(scenarioName as Scenario) ? scenarioName as Scenario : undefined;
    return {
        scenario,
        width: numberArgument('width', 1000, 1, 10000),
        height: numberArgument('height', 5000, 1, 20000),
        iterations: numberArgument('iterations', 5, 1, 100),
        sources: numberArgument('sources', 6, 1, 50),
    };
}

function track(canvas: Canvas, weakReferences: any[]): void {
    finalization.created += 1;
    registry?.register(canvas, finalization.created);
    if (WeakRefConstructor) weakReferences.push(new WeakRefConstructor(canvas));
}

function release(canvas: Canvas | undefined): void {
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context?.reset?.();
    canvas.width = 0;
    canvas.height = 0;
}

function memory(stage: string, scenario: Scenario, iteration?: number, weakReferences: any[] = []): void {
    const usage = process.memoryUsage();
    const snapshot = {
        stage,
        scenario,
        iteration,
        rssMiB: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
        heapUsedMiB: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
        externalMiB: Math.round(usage.external / 1024 / 1024 * 100) / 100,
        arrayBuffersMiB: Math.round(usage.arrayBuffers / 1024 / 1024 * 100) / 100,
        wrappers: {
            created: finalization.created,
            finalized: finalization.finalized,
            weakAlive: weakReferences.filter((reference) => reference.deref() !== undefined).length,
        },
        linux: getLinuxMemorySnapshot(),
    };
    console.log(`[MemoryProbe] ${JSON.stringify(snapshot)}`);
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function collectGarbage(): Promise<void> {
    const gc = (globalThis as any).gc;
    if (typeof gc !== 'function') {
        throw new Error('The probe must be started with node --expose-gc');
    }
    // Weak references cannot be cleared during the same JavaScript job in
    // which their targets were used. Yield between collections deliberately.
    for (let index = 0; index < 4; index += 1) {
        await delay(25);
        gc();
    }
    await delay(100);
}

function paint(canvas: Canvas): void {
    const context = canvas.getContext('2d');
    const tile = 128;
    for (let y = 0; y < canvas.height; y += tile) {
        for (let x = 0; x < canvas.width; x += tile) {
            const red = (x * 13 + y * 7) % 256;
            const green = (x * 3 + y * 17) % 256;
            const blue = (x * 11 + y * 5) % 256;
            context.fillStyle = `rgb(${red},${green},${blue})`;
            context.fillRect(x, y, tile, tile);
        }
    }
}

async function exercise(scenario: Scenario, options: ProbeOptions): Promise<any[]> {
    const weakReferences: any[] = [];
    if (scenario === 'baseline') return weakReferences;

    let output: Buffer | undefined;
    let finalCanvas: Canvas | undefined = new Canvas(options.width, options.height);
    track(finalCanvas, weakReferences);

    if (scenario !== 'create') paint(finalCanvas);

    if (scenario === 'encode') {
        output = await finalCanvas.toBuffer('png');
    } else if (scenario === 'encode-sync') {
        output = finalCanvas.toBufferSync('png');
    } else if (
        scenario === 'compose-final-only'
        || scenario === 'compose-all'
        || scenario === 'compose-all-sync'
    ) {
        const sourceHeight = Math.max(1, Math.ceil(options.height / options.sources));
        const sources: Canvas[] = [];
        const context = finalCanvas.getContext('2d');
        for (let index = 0; index < options.sources; index += 1) {
            const source = new Canvas(options.width, sourceHeight);
            track(source, weakReferences);
            paint(source);
            context.drawImage(source, 0, index * sourceHeight);
            sources.push(source);
        }
        output = scenario === 'compose-all-sync'
            ? finalCanvas.toBufferSync('png')
            : await finalCanvas.toBuffer('png');
        if (scenario === 'compose-all' || scenario === 'compose-all-sync') {
            for (const source of sources) release(source);
        }
    }

    release(finalCanvas);
    finalCanvas = undefined;
    output = undefined;
    return weakReferences;
}

function loadTrimAddon(): TrimAddon | undefined {
    try {
        return require(path.join(__dirname, 'malloc_trim.node')) as TrimAddon;
    } catch (error) {
        console.log(`[MemoryProbe] ${JSON.stringify({ stage: 'trim-unavailable', reason: String(error) })}`);
        return undefined;
    }
}

async function runScenario(options: ProbeOptions & { scenario: Scenario }): Promise<void> {
    memory('start', options.scenario);
    let allWeakReferences: any[] = [];
    for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
        const references = await exercise(options.scenario, options);
        allWeakReferences = allWeakReferences.concat(references);
        memory('after-work', options.scenario, iteration, allWeakReferences);
        await collectGarbage();
        memory('after-gc', options.scenario, iteration, allWeakReferences);
    }

    const trimAddon = loadTrimAddon();
    if (trimAddon) {
        const released = trimAddon.trim();
        await delay(100);
        memory(released ? 'after-trim-released' : 'after-trim-no-release', options.scenario, undefined, allWeakReferences);
    }
}

function runSuite(options: ProbeOptions): void {
    const runs: Array<{ scenario: Scenario; threadPoolSize?: number }> = [
        { scenario: 'baseline' },
        { scenario: 'create' },
        { scenario: 'draw' },
        { scenario: 'encode-sync' },
        { scenario: 'encode', threadPoolSize: 1 },
        { scenario: 'encode', threadPoolSize: 2 },
        { scenario: 'encode' },
        { scenario: 'compose-final-only' },
        { scenario: 'compose-all' },
        { scenario: 'compose-all-sync' },
    ];
    for (const run of runs) {
        console.log(`[MemoryProbe] ${JSON.stringify({
            stage: 'scenario-start',
            scenario: run.scenario,
            uvThreadpoolSize: run.threadPoolSize ?? process.env.UV_THREADPOOL_SIZE ?? 'default',
        })}`);
        const environment = { ...process.env };
        if (run.threadPoolSize) environment.UV_THREADPOOL_SIZE = String(run.threadPoolSize);
        const result = spawnSync(process.execPath, [
            '--expose-gc',
            __filename,
            `--scenario=${run.scenario}`,
            `--width=${options.width}`,
            `--height=${options.height}`,
            `--iterations=${options.iterations}`,
            `--sources=${options.sources}`,
        ], { stdio: 'inherit', env: environment });
        if (result.error || result.status !== 0) {
            throw result.error ?? new Error(`Scenario ${run.scenario} exited with status ${result.status}`);
        }
    }
}

async function main(): Promise<void> {
    const options = parseOptions();
    const pixels = options.width * options.height;
    console.log(`[MemoryProbe] ${JSON.stringify({
        stage: 'configuration',
        scenario: options.scenario ?? 'suite',
        width: options.width,
        height: options.height,
        pixels,
        rgbaMiB: Math.round(pixels * 4 / 1024 / 1024 * 100) / 100,
        iterations: options.iterations,
        sources: options.sources,
        uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? 'default',
        pid: process.pid,
    })}`);
    if (options.scenario) await runScenario({ ...options, scenario: options.scenario });
    else runSuite(options);
}

main().catch((error) => {
    console.error('[MemoryProbe] failed', error);
    process.exitCode = 1;
});
