#!/usr/bin/env node

// Install-step for single Raycast extensions: partially downloads one
// extension folder from the extensions repository into a catalog directory —
// by default the product external-extensions root — without cloning the repo.
// Acquisition shares the product install seam in @blastlauncher/core-node.
//
// Usage:
//   pnpm --filter @blastlauncher/e2e run fetch:extension -- donut
//   pnpm --filter @blastlauncher/e2e run fetch:extension -- donut --target ./my-catalog
//   pnpm --filter @blastlauncher/e2e run fetch:extension -- donut --revision <sha>

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { ExternalExtensionStore, fetchExtensionsFromRepo } from "@blastlauncher/core-node";

const PINNED_REVISION = "d4aae99c5e1d7ec19b2341f1058c20adfd3fdc91";
const CORPUS_URL = "https://github.com/raycast/extensions";

const options = parseArgs(process.argv.slice(2));

async function main() {
  if (options.names.length === 0) {
    console.error(
      "Usage: pnpm --filter @blastlauncher/e2e run fetch:extension -- <name> [--target <dir>] [--revision <sha>] [--cache-dir <dir>] [--corpus-url <url>] [--direct]",
    );
    process.exitCode = 2;
    return;
  }
  const stagingRoot = await mkdtemp(path.join(tmpdir(), "blast-fetch-staging-"));
  try {
    const { missing } = await fetchExtensionsFromRepo({
      repoUrl: options.corpusUrl,
      revision: options.revision,
      extensionNames: options.names,
      cacheDir: options.cacheDir,
      targetRoot: stagingRoot,
    });
    for (const name of missing) {
      console.error(`warning: ${name} not found at ${options.revision}; skipped`);
    }
    const fetched = options.names.filter((name) => !missing.includes(name));
    const store = new ExternalExtensionStore({ root: options.target });
    for (const name of fetched) {
      const stagedDir = path.join(stagingRoot, name);
      const manifest = JSON.parse(await readFile(path.join(stagedDir, "package.json"), "utf8"));
      const extensionId = typeof manifest.name === "string" ? manifest.name : name;
      const version = typeof manifest.version === "string" ? manifest.version : undefined;
      const commands = manifest.commands?.map((command) => command.name).join(", ") ?? "";
      if (options.direct) {
        // Debug escape hatch: raw copy path without store validation.
        const { cp } = await import("node:fs/promises");
        await cp(stagedDir, path.join(options.target, name), { recursive: true });
        console.log(`fetched ${name}@${version ?? "?"} into ${options.target} (commands: ${commands})`);
        continue;
      }
      const installed = await store.getInstalled(extensionId).catch(() => undefined);
      if (installed === undefined) {
        await store.install(stagedDir);
        console.log(`installed ${extensionId}@${version ?? "?"} into ${options.target} (commands: ${commands})`);
      } else if (installed.version !== undefined && version !== undefined && installed.version === version) {
        console.log(`up-to-date ${extensionId}@${version} in ${options.target} (commands: ${commands})`);
      } else {
        await store.update(stagedDir);
        console.log(
          `updated ${extensionId}@${installed.version ?? "?"} -> ${version ?? "?"} in ${options.target} (commands: ${commands})`,
        );
      }
    }
    if (fetched.length > 0) {
      console.log(
        "The running app picks new external extensions up through its catalog watcher; otherwise refresh the catalog.",
      );
    }
    if (missing.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = {
    names: [],
    target: path.join(homedir(), ".blast", "external-extensions"),
    revision: PINNED_REVISION,
    corpusUrl: CORPUS_URL,
    cacheDir: path.join(homedir(), ".cache", "blast-corpus"),
    direct: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--target") {
      options.target = path.resolve(argv[++index]);
    } else if (arg === "--revision") {
      options.revision = argv[++index];
    } else if (arg === "--corpus-url") {
      options.corpusUrl = argv[++index];
    } else if (arg === "--cache-dir") {
      options.cacheDir = argv[++index];
    } else if (arg === "--direct") {
      options.direct = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: pnpm --filter @blastlauncher/e2e run fetch:extension -- <name> [--target <dir>] [--revision <sha>] [--cache-dir <dir>] [--corpus-url <url>] [--direct]",
      );
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      options.names.push(arg);
    }
  }
  return options;
}

main().catch((error) => {
  console.error(`fetch:extension failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
