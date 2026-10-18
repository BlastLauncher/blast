#!/usr/bin/env node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { CoreClientHost } from "@blastlauncher/client";
import { connectLocalCoreClient, createNodeCoreDaemon } from "@blastlauncher/core-node";

const RUNNER_VERSION = 1;
const DEFAULT_ITERATIONS = 3;
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000;
const catalogRoot = fileURLToPath(new URL("../test/fixtures/catalog", import.meta.url));
const bootstrapPath = fileURLToPath(new URL("../test/fixtures/bootstrap.mjs", import.meta.url));
const identity = { extensionId: "e2e.scene", commandName: "index" };
const metricNames = [
  "daemonStartup",
  "clientReady",
  "coldCommandToScene",
  "coldStop",
  "warmDiscovery",
  "warmCommandToScene",
  "sceneEventRoundTrip",
  "warmStop",
];

const options = parseArguments(process.argv.slice(2));
const samples = [];

for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
  samples.push(await runSample(iteration, options.timeoutMilliseconds));
}

const report = {
  schemaVersion: 1,
  runner: "v2-application-boundary-performance",
  runnerVersion: RUNNER_VERSION,
  generatedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpuCount: os.availableParallelism?.() ?? os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
  },
  workload: {
    fixture: "e2e.scene",
    identity,
    catalog: "packages/blast-e2e/test/fixtures/catalog",
    iterations: options.iterations,
    timeoutMilliseconds: options.timeoutMilliseconds,
  },
  metrics: Object.fromEntries(metricNames.map((name) => [name, summarize(samples.map((sample) => sample[name]))])),
  samples,
};

if (options.outputPath === undefined) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const outputPath = path.resolve(options.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

async function runSample(iteration, timeoutMilliseconds) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blast-v2-performance-"));
  const socketPath = path.join(directory, "core.sock");
  const daemon = createNodeCoreDaemon({
    catalogRoot,
    bootstrapPath,
    environment: process.env,
    socketPath,
  });
  let host;
  let messageSequence = 0;

  try {
    const daemonStartedAt = performance.now();
    await daemon.start();
    const daemonStartup = elapsedSince(daemonStartedAt);

    host = new CoreClientHost({
      connect: () =>
        connectLocalCoreClient({
          socketPath,
          implementation: { name: "blast-v2-performance", version: "0.0.0" },
          createMessageId: () => `performance-client-${++messageSequence}`,
        }),
    });

    const clientReadyAt = performance.now();
    const ready = await host.start();
    const clientReady = elapsedSince(clientReadyAt);
    assertCommandDiscovered(ready.commands);

    const coldCommandAt = performance.now();
    await host.runCommand(identity);
    let snapshot = await waitForSnapshot(
      host,
      (next) => next.state === "running" && next.scene !== undefined,
      timeoutMilliseconds,
      "cold command scene",
    );
    const coldCommandToScene = elapsedSince(coldCommandAt);

    const coldStopAt = performance.now();
    await host.stopCommand("performance cold stop");
    await waitForSnapshot(host, isReady, timeoutMilliseconds, "cold command stop");
    const coldStop = elapsedSince(coldStopAt);

    const warmDiscoveryAt = performance.now();
    const refreshed = await host.refreshCommands();
    const warmDiscovery = elapsedSince(warmDiscoveryAt);
    assertCommandDiscovered(refreshed.commands);

    const warmCommandAt = performance.now();
    await host.runCommand(identity);
    snapshot = await waitForSnapshot(
      host,
      (next) => next.state === "running" && next.scene !== undefined,
      timeoutMilliseconds,
      "warm command scene",
    );
    const warmCommandToScene = elapsedSince(warmCommandAt);

    const actionEventId = findActionEventId(snapshot.scene);
    const eventAt = performance.now();
    await host.sendSceneEvent(actionEventId);
    await waitForSnapshot(
      host,
      (next) => next.scene?.children.some((child) => child.props.title === "Ran:event-action-1") === true,
      timeoutMilliseconds,
      "scene event update",
    );
    const sceneEventRoundTrip = elapsedSince(eventAt);

    const warmStopAt = performance.now();
    await host.stopCommand("performance warm stop");
    await waitForSnapshot(host, isReady, timeoutMilliseconds, "warm command stop");
    const warmStop = elapsedSince(warmStopAt);

    return {
      iteration,
      daemonStartup,
      clientReady,
      coldCommandToScene,
      coldStop,
      warmDiscovery,
      warmCommandToScene,
      sceneEventRoundTrip,
      warmStop,
    };
  } finally {
    await host?.close("performance sample complete").catch(() => {});
    await daemon.close("performance sample complete").catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
}

function waitForSnapshot(host, predicate, timeoutMilliseconds, description) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe;
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${description}`)), timeoutMilliseconds);
    timer.unref();

    const finish = (error, snapshot) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      if (error === undefined) {
        resolve(snapshot);
      } else {
        reject(error);
      }
    };

    unsubscribe = host.subscribe((snapshot) => {
      if (predicate(snapshot)) {
        finish(undefined, snapshot);
      }
    });
    if (settled) {
      unsubscribe();
    }
  });
}

function assertCommandDiscovered(commands) {
  if (
    !commands.some(
      (command) => command.extensionId === identity.extensionId && command.commandName === identity.commandName,
    )
  ) {
    throw new Error("The performance fixture command was not discovered");
  }
}

function findActionEventId(node) {
  if (node.type === "action" && typeof node.props.onAction === "string") {
    return node.props.onAction;
  }
  for (const child of node.children) {
    const eventId = findActionEventId(child);
    if (eventId !== undefined) {
      return eventId;
    }
  }
  throw new Error("The performance fixture did not publish an action event");
}

function isReady(snapshot) {
  return snapshot.state === "ready" && snapshot.activeCommand === undefined && snapshot.scene === undefined;
}

function elapsedSince(start) {
  return roundMilliseconds(performance.now() - start);
}

function summarize(values) {
  const sorted = values.toSorted((left, right) => left - right);
  const meanMs = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    samplesMs: values,
    minMs: sorted[0],
    meanMs: roundMilliseconds(meanMs),
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1),
  };
}

function percentile(sorted, percentileValue) {
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

function roundMilliseconds(value) {
  return Math.round(value * 1000) / 1000;
}

function parseArguments(args) {
  let iterations = DEFAULT_ITERATIONS;
  let timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS;
  let outputPath;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      console.log(
        "Usage: node packages/blast-e2e/scripts/measure-v2-performance.mjs [--iterations N] [--timeout-ms N] [--output PATH]",
      );
      process.exit(0);
    }
    if (argument === "--iterations") {
      iterations = parsePositiveInteger(args[++index], "iterations");
      continue;
    }
    if (argument === "--timeout-ms") {
      timeoutMilliseconds = parsePositiveInteger(args[++index], "timeout-ms");
      continue;
    }
    if (argument === "--output") {
      outputPath = args[++index];
      if (typeof outputPath !== "string" || outputPath.length === 0) {
        throw new Error("--output requires a path");
      }
      continue;
    }
    throw new Error(`Unknown argument ${argument}`);
  }

  return { iterations, timeoutMilliseconds, outputPath };
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}
