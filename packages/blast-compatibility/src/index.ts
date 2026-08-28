import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import { BLAST_PROTOCOL_VERSION } from "@blastlauncher/protocol";

export const RAYCAST_API_PACKAGE = "@raycast/api";

export interface ManifestCommandSummary {
  readonly name: string;
  readonly mode: string | undefined;
  readonly title: string | undefined;
}

export interface ManifestPreferenceSummary {
  readonly name: string;
  readonly type: string | undefined;
  readonly required: boolean | undefined;
}

export interface ExtensionManifestSummary {
  readonly name: string | undefined;
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly apiDependencyRange: string | undefined;
  readonly categories: readonly string[];
  readonly commands: readonly ManifestCommandSummary[];
  readonly preferences: readonly ManifestPreferenceSummary[];
}

export interface ApiImportCount {
  readonly api: string;
  readonly count: number;
}

export interface ExtensionScan {
  readonly directory: string;
  readonly manifest: ExtensionManifestSummary | undefined;
  readonly apiImports: readonly ApiImportCount[];
  readonly sourceFiles: number;
}

export interface CensusApiUsage {
  readonly api: string;
  readonly extensionCount: number;
  readonly usageCount: number;
}

export interface RangeCount {
  readonly range: string;
  readonly extensionCount: number;
}

export interface CensusReport {
  readonly protocolVersion: number;
  readonly corpusRevision: string;
  readonly corpusUrl: string | undefined;
  readonly extensions: {
    readonly total: number;
    readonly withManifest: number;
    readonly withApiImports: number;
  };
  readonly apiUsage: readonly CensusApiUsage[];
  readonly commandModes: Readonly<Record<string, number>>;
  readonly preferenceTypes: Readonly<Record<string, number>>;
  readonly apiDependencyRanges: readonly RangeCount[];
}

export interface CensusReportOptions {
  readonly corpusRevision: string;
  readonly corpusUrl?: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "build", "out", ".git", "coverage"]);

/**
 * Reads a Raycast extension manifest for census purposes. The census is
 * descriptive, so manifests are summarized leniently: unreadable or partial
 * manifests yield undefined or empty fields instead of failing the scan.
 */
export async function readManifestSummary(manifestPath: string): Promise<ExtensionManifestSummary | undefined> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const manifest = parsed as Record<string, unknown>;

  const dependencies =
    typeof manifest["dependencies"] === "object" && manifest["dependencies"] !== null
      ? (manifest["dependencies"] as Record<string, unknown>)
      : {};
  const apiDependencyRange =
    typeof dependencies[RAYCAST_API_PACKAGE] === "string" ? (dependencies[RAYCAST_API_PACKAGE] as string) : undefined;

  return {
    name: optionalString(manifest["name"]),
    title: optionalString(manifest["title"]),
    description: optionalString(manifest["description"]),
    apiDependencyRange,
    categories: stringArray(manifest["categories"]),
    commands: summarizeArray(manifest["commands"], (entry) => ({
      name: stringOrEmpty(entry["name"]),
      mode: optionalString(entry["mode"]),
      title: optionalString(entry["title"]),
    })),
    preferences: summarizeArray(manifest["preferences"], (entry) => ({
      name: stringOrEmpty(entry["name"]),
      type: optionalString(entry["type"]),
      required: typeof entry["required"] === "boolean" ? entry["required"] : undefined,
    })),
  };
}

/**
 * Scans one extension directory: summarizes the manifest and statically
 * collects `@raycast/api` import sites from every source file.
 */
export async function scanExtension(directory: string): Promise<ExtensionScan> {
  const manifest = await readManifestSummary(path.join(directory, "package.json"));
  const totals = new Map<string, number>();
  let sourceFiles = 0;

  for (const file of await listSourceFiles(directory)) {
    sourceFiles += 1;
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, false, scriptKind(file));
    for (const [api, count] of collectApiImports(sourceFile)) {
      totals.set(api, (totals.get(api) ?? 0) + count);
    }
  }

  return {
    directory,
    manifest,
    apiImports: sortedCounts(totals),
    sourceFiles,
  };
}

/**
 * Scans a corpus directory: every immediate subdirectory that contains a
 * `package.json` is treated as one extension.
 */
export async function scanCorpus(corpusDirectory: string): Promise<ExtensionScan[]> {
  const entries = await readdir(corpusDirectory, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(corpusDirectory, entry.name))
    .toSorted();

  const scans: ExtensionScan[] = [];
  for (const directory of directories) {
    try {
      await stat(path.join(directory, "package.json"));
    } catch {
      continue;
    }
    scans.push(await scanExtension(directory));
  }
  return scans;
}

/**
 * Aggregates extension scans into a deterministic census report. The report
 * records the corpus revision and protocol version per the compatibility
 * reporting rules; it contains no timestamps so repeated runs over the same
 * revision produce identical output.
 */
export function buildCensusReport(scans: readonly ExtensionScan[], options: CensusReportOptions): CensusReport {
  const usage = new Map<string, { extensionCount: number; usageCount: number }>();
  const commandModes = new Map<string, number>();
  const preferenceTypes = new Map<string, number>();
  const ranges = new Map<string, number>();

  for (const scan of scans) {
    for (const { api, count } of scan.apiImports) {
      const entry = usage.get(api) ?? { extensionCount: 0, usageCount: 0 };
      entry.extensionCount += 1;
      entry.usageCount += count;
      usage.set(api, entry);
    }

    const manifest = scan.manifest;
    if (manifest === undefined) {
      continue;
    }
    for (const command of manifest.commands) {
      const mode = command.mode ?? "unspecified";
      commandModes.set(mode, (commandModes.get(mode) ?? 0) + 1);
    }
    for (const preference of manifest.preferences) {
      const type = preference.type ?? "unspecified";
      preferenceTypes.set(type, (preferenceTypes.get(type) ?? 0) + 1);
    }
    if (manifest.apiDependencyRange !== undefined) {
      ranges.set(manifest.apiDependencyRange, (ranges.get(manifest.apiDependencyRange) ?? 0) + 1);
    }
  }

  const apiUsage = [...usage.entries()]
    .map(([api, counts]) => ({ api, ...counts }))
    .toSorted(
      (left, right) =>
        right.extensionCount - left.extensionCount ||
        right.usageCount - left.usageCount ||
        left.api.localeCompare(right.api),
    );

  const apiDependencyRanges = [...ranges.entries()]
    .map(([range, extensionCount]) => ({ range, extensionCount }))
    .toSorted((left, right) => right.extensionCount - left.extensionCount || left.range.localeCompare(right.range));

  return {
    protocolVersion: BLAST_PROTOCOL_VERSION,
    corpusRevision: options.corpusRevision,
    corpusUrl: options.corpusUrl,
    extensions: {
      total: scans.length,
      withManifest: scans.filter((scan) => scan.manifest !== undefined).length,
      withApiImports: scans.filter((scan) => scan.apiImports.length > 0).length,
    },
    apiUsage,
    commandModes: sortedRecord(commandModes),
    preferenceTypes: sortedRecord(preferenceTypes),
    apiDependencyRanges,
  };
}

function collectApiImports(sourceFile: ts.SourceFile): Map<string, number> {
  const counts = new Map<string, number>();
  const record = (api: string): void => {
    counts.set(api, (counts.get(api) ?? 0) + 1);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (
        moduleSpecifier !== undefined &&
        ts.isStringLiteral(moduleSpecifier) &&
        moduleSpecifier.text === RAYCAST_API_PACKAGE
      ) {
        collectModuleBindings(node, record);
      }
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const argument = node.arguments[0];
      if (argument !== undefined && ts.isStringLiteral(argument) && argument.text === RAYCAST_API_PACKAGE) {
        if (expression.kind === ts.SyntaxKind.ImportKeyword) {
          record("<dynamic>");
        } else if (ts.isIdentifier(expression) && expression.text === "require") {
          record("<require>");
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return counts;
}

function collectModuleBindings(node: ts.ImportDeclaration | ts.ExportDeclaration, record: (api: string) => void): void {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (clause === undefined) {
      record("<side-effect>");
      return;
    }
    const named = clause.namedBindings;
    if (named === undefined) {
      record("<default>");
      return;
    }
    if (ts.isNamespaceImport(named)) {
      record("<namespace>");
      return;
    }
    for (const element of named.elements) {
      record((element.propertyName ?? element.name).text);
    }
    return;
  }

  const named = node.exportClause;
  if (named === undefined || ts.isNamespaceExport(named)) {
    record("<namespace>");
    return;
  }
  for (const element of named.elements) {
    record((element.propertyName ?? element.name).text);
  }
}

async function listSourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }
        await walk(entryPath);
        continue;
      }
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(entryPath);
      }
    }
  };
  await walk(directory);
  return files.toSorted();
}

function scriptKind(file: string): ts.ScriptKind {
  switch (path.extname(file)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function sortedCounts(counts: Map<string, number>): ApiImportCount[] {
  return [...counts.entries()]
    .map(([api, count]) => ({ api, count }))
    .toSorted((left, right) => right.count - left.count || left.api.localeCompare(right.api));
}

function sortedRecord(counts: Map<string, number>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const key of [...counts.keys()].toSorted()) {
    record[key] = counts.get(key) as number;
  }
  return record;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function summarizeArray<T>(value: unknown, summarize: (entry: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map(summarize);
}
