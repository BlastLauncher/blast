// Entry point for `bun run corpus:smoke-deps` (task 0070). For every extension
// of the dependency-heavy set in `compat/corpus-deps.json`: fetch it (sparse,
// shallow, into `.cache/`), install its own dependencies with the engine's
// dependency install (decision 0008) under a timeout, bundle and launch each
// command exactly as `corpus:smoke` does but with the installed dependencies
// resolving, then delete the install so peak disk stays bounded. Writes
// `compat/smoke-deps.json` and `compat/SMOKE-DEPS.md`. Failures are the
// report's data, not errors: nothing here fixes Blast, and extension files are
// never modified.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openExtension } from "../../packages/host/src/index.ts";
import { fetchBatch } from "./batch.ts";
import {
  batchSize,
  checkDiskBudget,
  CORPUS_DIR,
  directoryBytes,
  maxMbFromEnv,
  megabytes,
  readPin,
} from "./corpus.ts";
import { DEPS_PIN_PATH, parseDepsPin } from "./deps-selection.ts";
import { bundleOne, launchOne } from "./smoke-command.ts";
import {
  buildDepsReport,
  classifyInstallFailure,
  installErrorExcerpt,
  installFailedResult,
  needsPreferencesResult,
  renderDepsJsonReport,
  renderDepsMarkdownReport,
  requiredPreferences,
  toDepsResult,
  type DepsResult,
  type InstallRecord,
} from "./smoke-deps.ts";
import {
  buildResult,
  commandMode,
  compactLine,
  manifestCommands,
  requiredArguments,
  sanitizePath,
  type Manifest,
} from "./smoke.ts";

/** One `npm install` may not run longer than this. */
const INSTALL_TIMEOUT_MS = 180_000;
/** Install output kept for classification, in characters. */
const MAX_LOG_CHARS = 200_000;

const DATA_DIR = ".cache/smoke-deps-data";
const NPM_CACHE_DIR = ".cache/smoke-deps-npm";

async function main(): Promise<void> {
  const started = performance.now();
  const root = process.cwd();
  const pin = readPin(root);
  const depsPin = parseDepsPin(JSON.parse(await readFile(join(root, DEPS_PIN_PATH), "utf8")));
  if (depsPin.commit !== pin.commit)
    throw new Error(`${DEPS_PIN_PATH} is at ${depsPin.commit}, the corpus pin is ${pin.commit}`);
  const maxMb = maxMbFromEnv(process.env);
  const size = batchSize(maxMb);
  const dataDir = join(root, DATA_DIR);
  const npmCache = join(root, NPM_CACHE_DIR);
  const extensions = depsPin.extensions.toSorted((a, b) => a.name.localeCompare(b.name));
  console.log(`corpus:smoke-deps: ${extensions.length} extensions in batches of ${size}`);

  // Path prefixes that must never appear in a committed report.
  const clean = (text: string): string =>
    compactLine(
      sanitizePath(text, [
        [root, "<repo>"],
        [tmpdir(), "<tmp>"],
      ]),
    );
  const cacheBytes = (): number => directoryBytes(join(root, ".cache"));
  let peakBytes = cacheBytes();
  const observe = (): number => {
    const bytes = cacheBytes();
    peakBytes = Math.max(peakBytes, bytes);
    return bytes;
  };

  const installs: InstallRecord[] = [];
  const results: DepsResult[] = [];
  const extensionFailures: { extension: string; error: string }[] = [];

  /** Install into `dataDir`, bounded by a timeout and the disk budget. */
  const install = async (
    extensionDir: string,
    name: string,
    packages: string[],
  ): Promise<InstallRecord> => {
    const output: string[] = [];
    let timedOut = false;
    let overBudget = false;
    // The handle's installer is injected only to add the timeout and an
    // out-of-tree npm cache; the arguments are the engine's, unchanged.
    const handle = openExtension({
      extensionDir,
      dataDir,
      installer: ({ command, args, cwd, onLog }) =>
        new Promise((done, reject) => {
          const child = spawn(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, npm_config_cache: npmCache },
          });
          const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, INSTALL_TIMEOUT_MS);
          // Poll while installing so one huge install cannot fill the disk.
          const watchdog = setInterval(() => {
            if (checkDiskBudget(observe(), maxMb) !== undefined) {
              overBudget = true;
              child.kill("SIGKILL");
            }
          }, 2000);
          for (const stream of [child.stdout, child.stderr]) {
            stream.on("data", (chunk: Buffer) => {
              const text = chunk.toString();
              onLog?.(text);
              output.push(text);
            });
          }
          const stop = (): void => {
            clearTimeout(timer);
            clearInterval(watchdog);
          };
          child.once("error", (error) => {
            stop();
            reject(error);
          });
          child.once("close", (code, signal) => {
            stop();
            if (code === 0) done();
            else reject(new Error(`npm install failed (${signal ?? code})`));
          });
        }),
    });
    const begun = performance.now();
    try {
      await handle.dependencies.install();
      const status = await handle.dependencies.check();
      const ms = performance.now() - begun;
      const bytes = directoryBytes(dataDir);
      observe();
      return {
        extension: name,
        packages,
        status: "installed",
        ms,
        bytes,
        ...(status.unresolved.length > 0 ? { unresolved: status.unresolved } : {}),
      };
    } catch (error) {
      const text = output.join("").slice(-MAX_LOG_CHARS);
      const reason = classifyInstallFailure(text, { timedOut, overBudget });
      return {
        extension: name,
        packages,
        status: "failed",
        ms: performance.now() - begun,
        bytes: directoryBytes(dataDir),
        reason,
        error: clean(
          installErrorExcerpt(text) || (error instanceof Error ? error.message : String(error)),
        ),
      };
    } finally {
      await handle.close();
    }
  };

  try {
    for (let offset = 0; offset < extensions.length; offset += size) {
      const batch = extensions.slice(offset, offset + size);
      peakBytes = Math.max(
        peakBytes,
        fetchBatch(
          batch.map((entry) => entry.name),
          root,
        ),
      );
      console.log(`corpus:smoke-deps: batch .cache is ${megabytes(peakBytes)} MB (peak so far)`);
      for (const { name, dependencies } of batch) {
        const extensionDir = join(root, CORPUS_DIR, "extensions", name);
        const manifestPath = join(extensionDir, "package.json");
        if (!existsSync(manifestPath)) {
          extensionFailures.push({ extension: name, error: "manifest missing from the checkout" });
          continue;
        }
        let manifest: Manifest;
        try {
          manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
        } catch (error) {
          extensionFailures.push({
            extension: name,
            error: clean(error instanceof Error ? error.message : String(error)),
          });
          continue;
        }
        const commands = manifestCommands(manifest);
        if (commands.length === 0) {
          extensionFailures.push({ extension: name, error: "manifest declares no commands" });
          continue;
        }
        process.stdout.write(`corpus:smoke-deps: ${name}: install `);
        try {
          const record = await install(extensionDir, name, dependencies);
          installs.push(record);
          console.log(
            `${record.status}${record.reason ? ` (${record.reason})` : ""} in ${(record.ms / 1000).toFixed(1)} s, ${megabytes(record.bytes)} MB`,
          );
          for (const commandName of commands) {
            const mode = commandMode(manifest, commandName) ?? "view";
            const base = { extension: name, command: commandName, mode };
            process.stdout.write(`corpus:smoke-deps: ${name}/${commandName}: `);
            let result: DepsResult;
            if (record.status === "failed") {
              result = installFailedResult(base, record);
            } else {
              result = await runCommand(extensionDir, name, manifest, commandName, mode, clean);
            }
            console.log(result.outcome);
            results.push(result);
          }
        } finally {
          // Drop this extension's install and npm cache before the next one.
          await rm(dataDir, { recursive: true, force: true });
          await rm(npmCache, { recursive: true, force: true });
          observe();
        }
      }
    }
  } finally {
    // Leave the checkout minimal: every extension dropped from the sparse set.
    fetchBatch([], root);
    await rm(dataDir, { recursive: true, force: true });
    await rm(npmCache, { recursive: true, force: true });
  }

  const report = buildDepsReport({
    commit: pin.commit,
    installs,
    results,
    extensionFailures,
    peakBytes,
    wallMs: performance.now() - started,
  });
  await writeFile(join(root, "compat/smoke-deps.json"), renderDepsJsonReport(report));
  await writeFile(join(root, "compat/SMOKE-DEPS.md"), renderDepsMarkdownReport(report));
  const totals = Object.entries(report.totals)
    .filter(([, count]) => count > 0)
    .map(([outcome, count]) => `${outcome} ${count}`)
    .join(", ");
  console.log(
    `corpus:smoke-deps: wrote compat/smoke-deps.json and compat/SMOKE-DEPS.md (${totals}), peak .cache ${megabytes(peakBytes)} MB, ${(report.wallMs / 1000).toFixed(0)} s`,
  );
  // Reported separately so a leftover is visible in the run log.
  const leftover = existsSync(dataDir) ? (await readdir(dataDir)).length : 0;
  if (leftover > 0) console.warn(`corpus:smoke-deps: ${DATA_DIR} was not emptied`);
}

/**
 * Bundle against the installed dependencies, then run the command unless it
 * needs launch arguments or preferences nothing can supply here. Bundling
 * first keeps those commands in the dependency signal.
 */
async function runCommand(
  extensionDir: string,
  extension: string,
  manifest: Manifest,
  commandName: string,
  mode: string,
  clean: (text: string) => string,
): Promise<DepsResult> {
  const dataDir = join(process.cwd(), DATA_DIR);
  const bundle = await bundleOne(
    extensionDir,
    commandName,
    { installedDependencies: true, dataDir },
    clean,
  );
  if (!bundle.ok) {
    return toDepsResult(
      buildResult({ extension, command: commandName, mode, probe: bundle.probe }),
    );
  }
  const gate = async (result: DepsResult): Promise<DepsResult> => {
    await rm(dirname(bundle.bundled.entry), { recursive: true, force: true });
    return { ...result, bundleMs: bundle.bundled.bundleMs };
  };
  const args = requiredArguments(manifest, commandName);
  if (args.length > 0) {
    return gate(
      toDepsResult(
        buildResult({
          extension,
          command: commandName,
          mode,
          probe: { kind: "missing-arguments", names: args },
        }),
      ),
    );
  }
  const preferences = requiredPreferences(manifest, commandName);
  if (preferences.length > 0) {
    return gate(
      needsPreferencesResult({ extension, command: commandName, mode, names: preferences }),
    );
  }
  return toDepsResult(await launchOne(extension, manifest, commandName, bundle.bundled, clean));
}

try {
  await main();
} catch (error) {
  console.error(`corpus:smoke-deps: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
