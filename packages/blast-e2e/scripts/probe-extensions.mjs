#!/usr/bin/env node

// Focused extension probe cycle: run the full V2 pipeline over a pickable set
// of corpus extensions without cloning the (huge) raycast/extensions repo.
//
// It materializes only the selected extensions via a cached partial clone
// (`git clone --filter=blob:none` + `git archive <rev> -- <dirs> | tar -x`),
// runs probe-corpus.mjs over that minimal root, prints a compact outcome
// table, and removes the temporary root afterwards (auto-cleanup per run).
//
// Usage:
//   pnpm --filter @blastlauncher/e2e run probe:extensions -- donut crawldoc
//   pnpm --filter @blastlauncher/e2e run probe:extensions -- --file extensions.txt
//   pnpm --filter @blastlauncher/e2e run probe:extensions -- \
//     --from-report docs/v2/compatibility/runtime-probe-post-slice.json \
//     --outcome third-party-dependency --limit 20
//   pnpm --filter @blastlauncher/e2e run probe:extensions -- \
//     --corpus-root /path/to/existing/checkout donut
//
// Options:
//   --file <path>            newline-separated extension directory names
//   --from-report <json>     pick directories from a previous probe report
//   --outcome <class>        with --from-report, filter by outcome
//                            (e.g. third-party-dependency, process-failure,
//                            timeout, structured-compatibility-error)
//   --limit <n> --offset <n> with --from-report, batch selection
//   --revision <sha>         corpus revision (default: pinned census revision)
//   --corpus-url <url>       (default: https://github.com/raycast/extensions)
//   --cache-dir <dir>        partial-clone cache (default: ~/.cache/blast-corpus)
//   --corpus-root <dir>      use an existing checkout, skip fetching entirely
//   --keep                   keep the temporary corpus root for inspection
//   --output <path>          keep the full probe JSON report at this path
//   --timeout <ms>           per-extension probe timeout (default 8000)
//   --concurrency <n>        probe concurrency (default 8)
//   --provision [store]      install manifest dependencies before probing
//                            (store defaults to <cache-dir>/deps)
//   --diagnostics            include failure diagnostics in the probe report
//   --json                   machine-readable summary on stdout

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchExtensionsFromRepo } from "@blastlauncher/core-node";

const PINNED_REVISION = "d4aae99c5e1d7ec19b2341f1058c20adfd3fdc91";
const CORPUS_URL = "https://github.com/raycast/extensions";
const FAILURE_OUTCOMES = new Set([
  "timeout",
  "process-failure",
  "third-party-dependency",
  "structured-compatibility-error",
  "no-entrypoint",
  "invalid-manifest",
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const probeScript = path.join(here, "probe-corpus.mjs");

const options = parseArgs(process.argv.slice(2));

async function main() {
  const names = await resolveExtensionNames(options);
  if (names.length === 0) {
    console.error("No extensions selected. Pass directory names, --file, or --from-report. See --help.");
    process.exitCode = 2;
    return;
  }

  let corpusRoot = options.corpusRoot;
  let temporaryRoot;
  if (corpusRoot === undefined) {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "blast-probe-corpus-"));
    corpusRoot = temporaryRoot;
    // Acquisition shares the product install seam in @blastlauncher/core-node:
    // a cached partial clone plus `git archive` streaming, no full checkout.
    const { missing } = await fetchExtensionsFromRepo({
      repoUrl: options.corpusUrl,
      revision: options.revision,
      extensionNames: names,
      cacheDir: options.cacheDir,
      targetRoot: corpusRoot,
    });
    for (const name of missing) {
      console.error(`warning: ${name} not found at ${options.revision}; skipped`);
    }
    if (missing.length === names.length) {
      throw new Error("None of the selected extensions exist at the requested revision");
    }
  }

  const reportPath =
    options.output ?? path.join(await mkdtemp(path.join(tmpdir(), "blast-probe-report-")), "report.json");
  try {
    await runProbe(corpusRoot, options.revision, reportPath, names, options, options.cacheDir);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    printSummary(report, options);
    process.exitCode = exitCodeFor(report) === 0 ? 0 : 1;
  } finally {
    if (temporaryRoot !== undefined && !options.keep) {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
    if (options.output === undefined && !options.keep) {
      await rm(path.dirname(reportPath), { recursive: true, force: true }).catch(() => {});
    } else if (options.output === undefined && options.keep) {
      console.error(`kept probe report at ${reportPath}`);
    }
    if (temporaryRoot !== undefined && options.keep) {
      console.error(`kept corpus root at ${temporaryRoot}`);
    }
  }
}

function parseArgs(argv) {
  const options = {
    names: [],
    file: undefined,
    fromReport: undefined,
    outcome: undefined,
    limit: undefined,
    offset: 0,
    revision: PINNED_REVISION,
    corpusUrl: CORPUS_URL,
    cacheDir: path.join(homedir(), ".cache", "blast-corpus"),
    corpusRoot: undefined,
    keep: false,
    output: undefined,
    timeout: undefined,
    concurrency: undefined,
    provision: undefined,
    diagnostics: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      console.error(readHelpHint());
      process.exit(0);
    } else if (arg === "--file") {
      options.file = argv[++index];
    } else if (arg === "--from-report") {
      options.fromReport = argv[++index];
    } else if (arg === "--outcome") {
      options.outcome = argv[++index];
    } else if (arg === "--limit") {
      options.limit = Number(argv[++index]);
    } else if (arg === "--offset") {
      options.offset = Number(argv[++index]);
    } else if (arg === "--revision") {
      options.revision = argv[++index];
    } else if (arg === "--corpus-url") {
      options.corpusUrl = argv[++index];
    } else if (arg === "--cache-dir") {
      options.cacheDir = argv[++index];
    } else if (arg === "--corpus-root") {
      options.corpusRoot = path.resolve(argv[++index]);
    } else if (arg === "--keep") {
      options.keep = true;
    } else if (arg === "--output") {
      options.output = path.resolve(argv[++index]);
    } else if (arg === "--timeout") {
      options.timeout = Number(argv[++index]);
    } else if (arg === "--concurrency") {
      options.concurrency = Number(argv[++index]);
    } else if (arg === "--provision") {
      const next = argv[index + 1];
      options.provision = next === undefined || next.startsWith("--") ? "" : argv[++index];
    } else if (arg === "--diagnostics") {
      options.diagnostics = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      options.names.push(arg);
    }
  }
  return options;
}

function readHelpHint() {
  return [
    "Usage: pnpm --filter @blastlauncher/e2e run probe:extensions -- [names...] [options]",
    "  names, --file <path>, or --from-report <json> [--outcome <class>] [--limit N] [--offset M]",
    "  --revision <sha> --corpus-url <url> --cache-dir <dir> --corpus-root <dir>",
    "  --keep --output <path> --timeout <ms> --concurrency <n> --provision [store] --diagnostics --json",
  ].join("\n");
}

async function resolveExtensionNames(options) {
  const names = [...options.names];
  if (options.file !== undefined) {
    const content = await readFile(options.file, "utf8");
    names.push(
      ...content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
  }
  if (options.fromReport !== undefined) {
    const report = JSON.parse(await readFile(options.fromReport, "utf8"));
    let results = report.results ?? [];
    if (options.outcome !== undefined) {
      results = results.filter((result) => result.outcome === options.outcome);
    }
    if (options.offset > 0) {
      results = results.slice(options.offset);
    }
    if (options.limit !== undefined) {
      results = results.slice(0, options.limit);
    }
    names.push(...results.map((result) => result.directory));
  }
  return [...new Set(names)];
}

async function runProbe(corpusRoot, revision, reportPath, names, options, cacheDir) {
  const env = { ...process.env };
  env.BLAST_CORPUS_PROBE_EXTENSIONS = names.join(",");
  if (options.provision !== undefined) {
    env.BLAST_CORPUS_PROBE_DEPS_STORE =
      options.provision.length > 0 ? path.resolve(options.provision) : path.join(cacheDir, "deps");
  }
  if (options.timeout !== undefined) {
    env.BLAST_CORPUS_PROBE_TIMEOUT_MS = String(options.timeout);
  }
  if (options.concurrency !== undefined) {
    env.BLAST_CORPUS_PROBE_CONCURRENCY = String(options.concurrency);
  }
  if (options.diagnostics) {
    env.BLAST_CORPUS_PROBE_INCLUDE_DIAGNOSTICS = "1";
  }
  await run("node", [probeScript, corpusRoot, revision, reportPath], "probe the selected extensions", env);
}

function printSummary(report, options) {
  const rows = (report.results ?? []).map((result) => ({
    directory: result.directory,
    outcome: result.outcome,
    detail: result.failureCode ?? result.commandName ?? "",
  }));
  if (options.json) {
    console.log(JSON.stringify({ outcomes: report.outcomes, results: rows }, null, 2));
    return;
  }
  const width = Math.max(...rows.map((row) => row.directory.length), "extension".length);
  console.log(`\n${"extension".padEnd(width)}  outcome                       detail`);
  for (const row of rows) {
    console.log(`${row.directory.padEnd(width)}  ${row.outcome.padEnd(28)}  ${row.detail}`);
  }
  console.log(`\n${JSON.stringify(report.outcomes)}`);
  const failures = rows.filter((row) => FAILURE_OUTCOMES.has(row.outcome));
  if (failures.length > 0) {
    console.error(`\n${failures.length} failing extension(s). Re-run with --diagnostics for failure output, or`);
    console.error("narrow further: probe:extensions -- <single-name> --diagnostics");
  } else {
    console.log("\nAll selected extensions render (excluding by-design not-renderable modes).");
  }
}

function exitCodeFor(report) {
  return (report.results ?? []).some((result) => FAILURE_OUTCOMES.has(result.outcome)) ? 1 : 0;
}

function run(command, args, label, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "ignore", "inherit"] });
    child.on("error", (error) => reject(new Error(`failed to ${label}: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`failed to ${label} (exit ${code})`));
      }
    });
  });
}

main().catch((error) => {
  console.error(`probe:extensions failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
