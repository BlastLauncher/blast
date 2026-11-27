// Measures how much of a local Alfred workflow corpus Blast runs (decision
// 0021, point 5: compatibility is measured, never claimed). Scans a directory
// for `.alfredworkflow` archives and unpacked workflows, reads each manifest
// the way the host does, and counts object types against what the runtime
// implements. Archives are read in memory; nothing is extracted or executed.
//
//   bun run alfred:analyze <dir> [--json] [--top N]

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  loadWorkflow,
  parsePlist,
  parseWorkflow,
  PASSIVE_TRIGGER_TYPES,
  readZipEntries,
  SUPPORTED_OBJECT_TYPES,
  workflowToManifest,
  type AlfredWorkflow,
} from "../../packages/alfred/src/index.ts";
import { parseManifest } from "../../packages/host/src/extension-manifest.ts";

const ARCHIVE_SUFFIX = ".alfredworkflow";

export type ObjectCounts = { total: number; supported: number; passive: number; unsupported: number };

export type WorkflowAnalysis = {
  /** Relative to the scanned directory, with `/` separators. */
  path: string;
  kind: "archive" | "directory";
  ok: boolean;
  error?: string;
  name?: string;
  commands: number;
  objects: ObjectCounts;
  unsupportedTypes: string[];
  fullySupported: boolean;
};

export type CorpusAnalysis = {
  workflows: number;
  /** Plist parsed and the Blast manifest validated. */
  parsed: number;
  /** At least one command Blast can launch. */
  runnable: number;
  /** Runnable with no unsupported objects. */
  fullySupported: number;
  objects: ObjectCounts;
  /** Supported share of executable objects (passive triggers excluded), in percent. */
  coverage: number | null;
  topUnsupported: { type: string; count: number }[];
  results: WorkflowAnalysis[];
};

const SUPPORTED = new Set(SUPPORTED_OBJECT_TYPES);
const PASSIVE = new Set(PASSIVE_TRIGGER_TYPES);

/** Archives and unpacked workflow folders under `dir`, sorted; a workflow folder is not descended. */
async function findWorkflows(
  dir: string,
): Promise<{ path: string; kind: WorkflowAnalysis["kind"] }[]> {
  const found: { path: string; kind: WorkflowAnalysis["kind"] }[] = [];
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === "info.plist")) {
      found.push({ path: current, kind: "directory" });
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(ARCHIVE_SUFFIX)) {
        found.push({ path, kind: "archive" });
      } else if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        await walk(path);
      }
    }
  };
  await walk(dir);
  return found.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function readArchive(path: string): Promise<{ workflow: AlfredWorkflow; files: string[] }> {
  const entries = readZipEntries(new Uint8Array(await readFile(path)));
  const plist = entries.find((entry) => entry.name === "info.plist");
  if (!plist) throw new Error("archive has no top-level info.plist");
  const files = entries.filter((entry) => !entry.name.includes("/")).map((entry) => entry.name);
  return { workflow: parseWorkflow(parsePlist(plist.read())), files };
}

async function readDirectory(path: string): Promise<{ workflow: AlfredWorkflow; files: string[] }> {
  const [workflow, files] = await Promise.all([loadWorkflow(path), readdir(path)]);
  return { workflow, files };
}

async function analyzeOne(
  root: string,
  path: string,
  kind: WorkflowAnalysis["kind"],
): Promise<WorkflowAnalysis> {
  const analysis: WorkflowAnalysis = {
    path: relative(root, path).split(/[\\/]/).join("/") || ".",
    kind,
    ok: false,
    commands: 0,
    objects: { total: 0, supported: 0, passive: 0, unsupported: 0 },
    unsupportedTypes: [],
    fullySupported: false,
  };
  try {
    const { workflow, files } = kind === "archive" ? await readArchive(path) : await readDirectory(path);
    const manifest = parseManifest(
      workflowToManifest(workflow, { existingFiles: new Set(files) }).manifest,
    );
    analysis.ok = true;
    analysis.name = manifest.title;
    analysis.commands = manifest.commands.length;
    for (const object of workflow.objects) {
      analysis.objects.total++;
      if (SUPPORTED.has(object.type)) analysis.objects.supported++;
      else if (PASSIVE.has(object.type)) analysis.objects.passive++;
      else {
        analysis.objects.unsupported++;
        analysis.unsupportedTypes.push(object.type);
      }
    }
    analysis.fullySupported = analysis.commands > 0 && analysis.objects.unsupported === 0;
  } catch (error) {
    analysis.error = error instanceof Error ? error.message : String(error);
  }
  return analysis;
}

/** Scans `dir` recursively and measures every workflow found. */
export async function analyzeWorkflowDirectory(dir: string): Promise<CorpusAnalysis> {
  const root = resolve(dir);
  const results: WorkflowAnalysis[] = [];
  for (const { path, kind } of await findWorkflows(root)) {
    results.push(await analyzeOne(root, path, kind));
  }
  const objects: ObjectCounts = { total: 0, supported: 0, passive: 0, unsupported: 0 };
  const unsupported = new Map<string, number>();
  for (const result of results) {
    for (const key of Object.keys(objects) as (keyof ObjectCounts)[]) {
      objects[key] += result.objects[key];
    }
    for (const type of result.unsupportedTypes) {
      unsupported.set(type, (unsupported.get(type) ?? 0) + 1);
    }
  }
  const executable = objects.supported + objects.unsupported;
  return {
    workflows: results.length,
    parsed: results.filter((result) => result.ok).length,
    runnable: results.filter((result) => result.commands > 0).length,
    fullySupported: results.filter((result) => result.fullySupported).length,
    objects,
    coverage: executable === 0 ? null : Math.round((objects.supported / executable) * 1000) / 10,
    topUnsupported: [...unsupported]
      .map(([type, count]) => ({ type, count }))
      .toSorted((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1)),
    results,
  };
}

/** The human-readable summary the CLI prints. */
export function formatAnalysis(analysis: CorpusAnalysis, top = 10): string {
  const share = (n: number) =>
    analysis.workflows === 0 ? "" : ` (${Math.round((n / analysis.workflows) * 100)}%)`;
  const { objects } = analysis;
  const lines = [
    `Workflows:            ${analysis.workflows}`,
    `Parsed + manifest:    ${analysis.parsed}${share(analysis.parsed)}`,
    `Runnable entry:       ${analysis.runnable}${share(analysis.runnable)}`,
    `Fully supported:      ${analysis.fullySupported}${share(analysis.fullySupported)}`,
    `Objects:              ${objects.total} (${objects.supported} supported, ${objects.passive} passive triggers, ${objects.unsupported} unsupported)`,
    `Execution coverage:   ${analysis.coverage === null ? "n/a" : `${analysis.coverage}%`}`,
  ];
  if (analysis.topUnsupported.length > 0) {
    lines.push("", "Top unsupported object types (objects):");
    for (const { type, count } of analysis.topUnsupported.slice(0, top)) {
      lines.push(`  ${String(count).padStart(5)}  ${type}`);
    }
  }
  const failures = analysis.results.filter((result) => !result.ok);
  if (failures.length > 0) {
    lines.push("", "Failed to parse:");
    for (const failure of failures) lines.push(`  ${failure.path}: ${failure.error}`);
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const topIndex = args.indexOf("--top");
  const top = topIndex >= 0 ? Number(args[topIndex + 1]) : 10;
  const dir = args.find(
    (arg, index) => !arg.startsWith("--") && (topIndex < 0 || index !== topIndex + 1),
  );
  if (!dir || !Number.isInteger(top) || top < 0) {
    console.error("usage: bun run alfred:analyze <dir> [--json] [--top N]");
    process.exit(2);
  }
  const analysis = await analyzeWorkflowDirectory(dir);
  console.log(json ? JSON.stringify(analysis, null, 2) : formatAnalysis(analysis, top));
}
