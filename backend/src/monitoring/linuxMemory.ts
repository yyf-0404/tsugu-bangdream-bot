import * as fs from 'node:fs';

type MemoryFields = Record<string, number>;

export interface LinuxMemorySnapshot {
    process?: MemoryFields;
    smaps?: MemoryFields;
    cgroup?: MemoryFields;
}

function bytesToMiB(bytes: number): number {
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function readText(path: string): string | undefined {
    try {
        return fs.readFileSync(path, 'utf8');
    } catch {
        return undefined;
    }
}

function parseKilobyteFields(text: string | undefined, names: Record<string, string>): MemoryFields | undefined {
    if (!text) return undefined;
    const result: MemoryFields = {};
    for (const line of text.split('\n')) {
        const match = /^([^:]+):\s+(\d+)\s+kB$/.exec(line.trim());
        if (!match) continue;
        const outputName = names[match[1]];
        if (outputName) result[outputName] = bytesToMiB(Number(match[2]) * 1024);
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function readCgroupV2(): MemoryFields | undefined {
    const current = readText('/sys/fs/cgroup/memory.current');
    const stat = readText('/sys/fs/cgroup/memory.stat');
    if (!current && !stat) return undefined;

    const result: MemoryFields = {};
    if (current) result.currentMiB = bytesToMiB(Number(current.trim()));
    if (stat) {
        const wanted: Record<string, string> = {
            anon: 'anonMiB',
            file: 'fileMiB',
            kernel: 'kernelMiB',
            slab: 'slabMiB',
            sock: 'socketMiB',
        };
        for (const line of stat.split('\n')) {
            const [name, rawValue] = line.trim().split(/\s+/);
            const outputName = wanted[name];
            if (outputName && rawValue) result[outputName] = bytesToMiB(Number(rawValue));
        }
    }
    return result;
}

/**
 * Break Linux RSS down into anonymous, file-backed, and cgroup memory. These
 * values identify where growth lives; they do not attempt to reclaim memory.
 */
export function getLinuxMemorySnapshot(): LinuxMemorySnapshot | undefined {
    if (process.platform !== 'linux') return undefined;

    const processMemory = parseKilobyteFields(readText('/proc/self/status'), {
        RssAnon: 'rssAnonMiB',
        RssFile: 'rssFileMiB',
        RssShmem: 'rssShmemMiB',
        VmData: 'vmDataMiB',
        VmSwap: 'vmSwapMiB',
    });
    const smaps = parseKilobyteFields(readText('/proc/self/smaps_rollup'), {
        Rss: 'rssMiB',
        Pss: 'pssMiB',
        Pss_Anon: 'pssAnonMiB',
        Pss_File: 'pssFileMiB',
        Anonymous: 'anonymousMiB',
        Private_Dirty: 'privateDirtyMiB',
        Private_Clean: 'privateCleanMiB',
        Shared_Dirty: 'sharedDirtyMiB',
        Shared_Clean: 'sharedCleanMiB',
        Swap: 'swapMiB',
    });
    const cgroup = readCgroupV2();

    return { process: processMemory, smaps, cgroup };
}
