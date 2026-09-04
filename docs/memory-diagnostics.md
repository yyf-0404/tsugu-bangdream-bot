# 原生图片内存诊断

这套探针只用于判断内存归属，不修改正式渲染、缓存、并发或分配器策略。

## 1. 构建诊断镜像

在仓库根目录执行：

```bash
docker build --target diagnostics -t tsugu-memory-diagnostics ./backend
```

## 2. 运行隔离场景

先用约 19 MiB 的画布验证流程：

```bash
docker run --rm tsugu-memory-diagnostics \
  npm run diagnose:memory -- --width=1000 --height=5000 --iterations=5
```

每个场景都会在独立 Node.js 进程中运行，避免前一个场景的原生内存高水位污染下一个场景：

- `baseline`：只加载 `skia-canvas`。
- `create`：创建并释放 Canvas，不绘制、不编码。
- `draw`：绘制后释放，不编码。
- `encode`：绘制、异步 `toBuffer('png')` 后释放。
- `encode-sync`：绘制、同步 `toBufferSync('png')` 后释放，用于判断异步线程池影响。
- `compose-final-only`：模拟当前业务，只显式释放最终 Canvas。
- `compose-all`：最终 Canvas 和所有来源 Canvas 都显式释放。
- `compose-all-sync`：释放全部 Canvas，但使用同步编码。

完整测试还会把异步 `encode` 分别放在 `UV_THREADPOOL_SIZE=1`、`2` 和默认配置下运行。如果稳定 RSS 随线程数近似线性增加，可以把问题定位到异步工作线程及其线程局部原生分配，而不是仍存活的 Canvas 对象。

确认小尺寸不会触发容器 OOM 后，可复现日志中最大画布：

```bash
docker run --rm tsugu-memory-diagnostics \
  npm run diagnose:memory -- --width=4320 --height=7140 --iterations=3
```

## 3. 判断结果

比较每个场景最后一次 `after-gc` 和 `after-trim-*`：

- `wrappers.weakAlive` 持续增加：JavaScript 仍持有 Canvas 包装对象。
- `weakAlive` 回到 0，`after-trim-released` 的 RSS 大幅下降：glibc 已有空闲块，但此前没有归还系统。
- `weakAlive` 回到 0，trim 后 RSS 仍不下降：原生库仍持有内存，需要原生分配调用栈确认。
- `draw` 稳定而 `encode` 增长：问题集中在 `toBuffer` 编码路径。
- 异步编码增长而同步编码稳定：问题集中在异步渲染线程或其线程局部分配。
- `compose-final-only` 增长、`compose-all` 稳定：业务缺少中间 Canvas 的显式释放。
- 两个 compose 场景都增长且接近：问题更偏向 Skia 或分配器，而不是中间 Canvas 的 JS 生命周期。

生产监控日志中的 `linux.process.rssAnonMiB`、`linux.smaps.anonymousMiB` 与
`linux.cgroup.anonMiB` 可以确认 Docker 增长是否主要来自匿名原生内存。

## 4. 采集原生分配调用栈

只有在 `weakAlive` 为 0 且 trim 无法回落时才需要运行：

```bash
mkdir -p heaptrack-output
docker run --rm \
  -v "$PWD/heaptrack-output:/profiles" \
  tsugu-memory-diagnostics \
  heaptrack -o /profiles/skia \
  node --expose-gc dist/diagnostics/skiaMemoryProbe.js \
  --scenario=encode --width=4320 --height=7140 --iterations=3
```

容器会在 `heaptrack-output` 中生成压缩报告。该报告用于确认退出前仍存活的
原生分配来自 `skia-canvas`/Skia、PNG 编码器还是其他共享库。
