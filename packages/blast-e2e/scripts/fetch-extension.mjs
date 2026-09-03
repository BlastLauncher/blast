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

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { fetchExtensionsFromRepo } from "@blastlauncher/core-node";

const PINNED_REVISION = "d4aae99c5e1d7ec19b2341f1058c20adfd3fdc91";
const CORPUS_URL = "https://github.com/raycast/extensions";

const options = parseArgs(process.argv.slice(2));

async function main() {
  if (options.names.length === 0) {
    console.error(
      "Usage: pnpm --filter @blastlauncher/e2e run fetch:extension -- <name> [--target <dir>] [--revision <sha>] [--cache-dir <dir>] [--corpus-url <url>]",
    );
    process.exitCode = 2;
    return;
  }
  const { missing } = await fetchExtensionsFromRepo({
    repoUrl: options.corpusUrl,
    revision: options.revision,
    extensionNames: options.names,
    cacheDir: options.cacheDir,
    targetRoot: options.target,
  });
  for (const name of missing) {
    console.error(`warning: ${name} not found at ${options.revision}; skipped`);
  }
  const fetched = options.names.filter((name) => !missing.includes(name));
  for (const name of fetched) {
    const manifest = JSON.parse(await readFile(path.join(options.target, name, "package.json"), "utf8"));
    const commands = manifest.commands?.map((command) => command.name).join(", ") ?? "";
    console.log(`installed ${name}@${manifest.version ?? "?"} into ${options.target} (commands: ${commands})`);
  }
  if (fetched.length > 0) {
    console.log(
      "The running app picks new external extensions up through its catalog watcher; otherwise refresh the catalog.",
    );
  }
  if (missing.length > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const options = {
    names: [],
    target: path.join(homedir(), ".blast", "external-extensions"),
    revision: PINNED_REVISION,
    corpusUrl: CORPUS_URL,
    cacheDir: path.join(homedir(), ".cache", "blast-corpus"),
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
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: pnpm --filter @blastlauncher/e2e run fetch:extension -- <name> [--target <dir>] [--revision <sha>] [--cache-dir <dir>] [--corpus-url <url>]",
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
