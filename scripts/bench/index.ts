/**
 * Reproducible local performance benchmark for Blast.
 * Measures host launch (cold vs cached vs warm runtime pool), runtime -> host
 * scene vs scene.patch wire bytes, `blast serve` embedder view bytes, and TUI
 * startup/rendering (reusing `scripts/tui-benchmark.ts`).
 *
 * Intentionally outside `bun run verify` and `bun test`: timings depend on the
 * host machine. Never opens real terminals, clipboards, apps, windows or the
 * network, and cleans up all temporary data directories.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { cpus, release, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createEngine, type Session } from "../../packages/host/src/index.ts";
import { helloListFirstFrameMs, listKeyLatenciesMs, tuiStartupSamples } from "../tui-benchmark.ts";
import {
  formatBenchReport,
  measureLargeListWire,
  parseBenchArgs,
  summarizeSamples,
  type BenchEnvironment,
  type BenchReport,
} from "./helpers.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const helloListDir = resolve(repoRoot, "fixtures/extensions/hello-list");

// Allow a newly spawned standby worker (`--prewarm`) to finish loading the
// `@raycast/api` shim with a warm Node compile cache before claiming it.
const PREWARM_SETTLE_MS = 400;

function waitForFirstScene(session: Session): Promise<void> {
  return new Promise<void>((done, reject) => {
    let settled = false;
    let stop: (() => void) | undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      stop?.();
      settle();
    };
    stop = session.scenes((scene) => {
      if (scene.root) finish(done);
    });
    if (settled) stop();
    void session.exited.then((exit) => {
      finish(() =>
        reject(exit.error ?? new Error(`Runtime exited before first scene (code ${exit.code})`)),
      );
    });
  });
}

async function measureHostLaunch(samples: number): Promise<BenchReport["hostLaunch"]> {
  const coldEmptyDataDir: number[] = [];
  for (let i = 0; i < samples; i++) {
    const dataDir = await mkdtemp(join(tmpdir(), "blast-bench-cold-"));
    const engine = createEngine({ dataDir });
    try {
      const ext = engine.openExtension({ extensionDir: helloListDir });
      const started = performance.now();
      const opened = await ext.launch("index");
      await waitForFirstScene(opened.session);
      coldEmptyDataDir.push(performance.now() - started);
      await opened.close();
    } finally {
      await engine.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  }

  // Share one pre-warmed dataDir (bundle + Node compile cache) so the next two
  // groups isolate the standby runtime pool with identical disk caches.
  const sharedDataDir = await mkdtemp(join(tmpdir(), "blast-bench-shared-"));
  try {
    // Untimed warmup populates `<dataDir>/bundles/` and `<dataDir>/compile-cache/`.
    {
      const warmupEngine = createEngine({ dataDir: sharedDataDir });
      try {
        const ext = warmupEngine.openExtension({ extensionDir: helloListDir });
        const opened = await ext.launch("index");
        await waitForFirstScene(opened.session);
        await opened.close();
      } finally {
        await warmupEngine.close();
      }
    }

    // Cached, no standby child: one fresh engine (empty runtime pool) per sample.
    const cachedNoPool: number[] = [];
    for (let i = 0; i < samples; i++) {
      const engine = createEngine({ dataDir: sharedDataDir });
      try {
        const ext = engine.openExtension({ extensionDir: helloListDir });
        const started = performance.now();
        const opened = await ext.launch("index");
        await waitForFirstScene(opened.session);
        cachedNoPool.push(performance.now() - started);
        await opened.close();
      } finally {
        await engine.close();
      }
    }

    // Warm, pool primed: opening `engine.root()` schedules the first standby
    // child and each launch replenishes the next one after acquisition.
    const warmPoolPrimed: number[] = [];
    const warmEngine = createEngine({ dataDir: sharedDataDir });
    try {
      const ext = warmEngine.openExtension({ extensionDir: helloListDir });
      const root = warmEngine.root({ views: { platform: "Linux" } });
      await root.ready();
      for (let i = 0; i < samples; i++) {
        await new Promise((done) => setTimeout(done, PREWARM_SETTLE_MS));
        const started = performance.now();
        const opened = await ext.launch("index");
        await waitForFirstScene(opened.session);
        warmPoolPrimed.push(performance.now() - started);
        await opened.close();
      }
      await root.close();
    } finally {
      await warmEngine.close();
    }

    return {
      coldEmptyDataDirMs: summarizeSamples(coldEmptyDataDir),
      cachedNoPoolMs: summarizeSamples(cachedNoPool),
      warmPoolPrimedMs: summarizeSamples(warmPoolPrimed),
    };
  } finally {
    await rm(sharedDataDir, { recursive: true, force: true });
  }
}

function safeExec(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function collectEnvironment(): BenchEnvironment {
  const cpuList = cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
    cpuModel: cpuList[0]?.model.trim() || "unknown",
    cpuCount: cpuList.length,
    nodeVersion: safeExec("node", ["-v"]),
    bunVersion: Bun.version,
    gitSha: safeExec("git", ["rev-parse", "--short", "HEAD"]),
    timestamp: new Date().toISOString(),
  };
}

function defaultOutputPath(timestamp: string): string {
  const slug = timestamp.replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
  return resolve(repoRoot, ".cache/bench", `bench-${slug}.json`);
}

async function main() {
  const args = parseBenchArgs(process.argv.slice(2));
  const environment = collectEnvironment();

  const hostLaunch = await measureHostLaunch(args.samples);
  const wireRows = measureLargeListWire([1_000, 10_000]);

  const startup = await tuiStartupSamples(args.samples);
  const firstFrames: number[] = [];
  for (let i = 0; i < args.samples; i++) {
    firstFrames.push(await helloListFirstFrameMs());
  }
  const keyLatencies = await listKeyLatenciesMs(20);

  const report: BenchReport = {
    version: 1,
    samples: args.samples,
    environment,
    hostLaunch,
    wire: {
      query: "42",
      rows: wireRows,
    },
    tui: {
      popupColdRootMs: summarizeSamples(startup.cold.map((run) => run.root)),
      popupColdCommandMs: summarizeSamples(startup.cold.map((run) => run.command)),
      popupWarmRootMs: summarizeSamples(startup.warm.map((run) => run.root)),
      popupWarmCommandMs: summarizeSamples(startup.warm.map((run) => run.command)),
      helloListFirstFrameMs: summarizeSamples(firstFrames),
      listKeyLatencyMs: summarizeSamples(keyLatencies),
    },
  };

  const outPath = args.outPath ? resolve(args.outPath) : defaultOutputPath(environment.timestamp);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(formatBenchReport(report));
  const displayPath = relative(repoRoot, outPath);
  console.log(`\nWrote JSON: ${displayPath.startsWith("..") ? outPath : displayPath}`);
}

await main();
