import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import { BLAST_PROTOCOL_VERSION } from "@blastlauncher/protocol";

export * from "./declaration-inventory.js";

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

export interface ApiMemberCount {
  readonly member: string;
  readonly count: number;
}

export interface ExtensionMemberScan {
  readonly directory: string;
  readonly memberUsage: readonly ApiMemberCount[];
  readonly sourceFiles: number;
}

export interface MemberUsage {
  readonly member: string;
  readonly extensionCount: number;
  readonly usageCount: number;
}

export interface MemberUsageReport {
  readonly memberUsage: readonly MemberUsage[];
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
 * Scans one extension directory for nested `@raycast/api` member usage such
 * as `Detail.Metadata.TagList.Item` or `Action.OpenWith`. Only value-level
 * member expressions and JSX tags rooted at a package binding are counted;
 * type positions and dynamic imports are out of scope.
 */
export async function scanExtensionMembers(directory: string): Promise<ExtensionMemberScan> {
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
    // Parent pointers are required so nested member segments are counted
    // once at the outermost chain and bare JSX tags resolve their position.
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
    for (const [member, count] of collectApiMemberUsage(sourceFile)) {
      totals.set(member, (totals.get(member) ?? 0) + count);
    }
  }

  return {
    directory,
    memberUsage: sortedMemberCounts(totals),
    sourceFiles,
  };
}

/**
 * Aggregates per-extension member scans into a deterministic usage report
 * sorted by extension count, then usage count, then member name.
 */
export function buildMemberUsageReport(scans: readonly ExtensionMemberScan[]): MemberUsageReport {
  const usage = new Map<string, { extensionCount: number; usageCount: number }>();

  for (const scan of scans) {
    for (const { member, count } of scan.memberUsage) {
      const entry = usage.get(member) ?? { extensionCount: 0, usageCount: 0 };
      entry.extensionCount += 1;
      entry.usageCount += count;
      usage.set(member, entry);
    }
  }

  const memberUsage = [...usage.entries()]
    .map(([member, counts]) => ({ member, ...counts }))
    .toSorted(
      (left, right) =>
        right.extensionCount - left.extensionCount ||
        right.usageCount - left.usageCount ||
        left.member.localeCompare(right.member),
    );
  return { memberUsage };
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

/**
 * Counts nested member paths rooted at `@raycast/api` bindings, e.g.
 * `Detail.Metadata.TagList.Item`, `Action.OpenWith`, or `<List.Item>`.
 * Named imports resolve through their local (possibly aliased) name,
 * namespace imports and `require()` objects resolve through the local
 * namespace root, and simple destructured `require()` bindings resolve like
 * named imports. This is a best-effort static heuristic: shadowed locals,
 * re-exports, and dynamic imports are not resolved.
 */
export function collectApiMemberUsage(sourceFile: ts.SourceFile): Map<string, number> {
  const counts = new Map<string, number>();
  const bindings = new Map<string, string>();
  const record = (member: string): void => {
    counts.set(member, (counts.get(member) ?? 0) + 1);
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === RAYCAST_API_PACKAGE
    ) {
      const named = statement.importClause?.namedBindings;
      if (named !== undefined && ts.isNamespaceImport(named)) {
        bindings.set(named.name.text, "");
      } else if (named !== undefined && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          bindings.set(element.name.text, (element.propertyName ?? element.name).text);
        }
      }
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (
          initializer === undefined ||
          !ts.isCallExpression(initializer) ||
          !ts.isIdentifier(initializer.expression) ||
          initializer.expression.text !== "require" ||
          initializer.arguments.length !== 1
        ) {
          continue;
        }
        const [requiredModule] = initializer.arguments;
        if (
          requiredModule === undefined ||
          !ts.isStringLiteral(requiredModule) ||
          requiredModule.text !== RAYCAST_API_PACKAGE
        ) {
          continue;
        }
        if (ts.isIdentifier(declaration.name)) {
          bindings.set(declaration.name.text, "");
        } else if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            if (ts.isIdentifier(element.name) && element.name.text.length > 0) {
              const api =
                element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
                  ? element.propertyName.text
                  : element.name.text;
              bindings.set(element.name.text, api);
            }
          }
        }
      }
    }
  }

  const chainText = (node: ts.PropertyAccessExpression): { root: string; path: string } | undefined => {
    const segments: string[] = [node.name.text];
    let current: ts.Expression = node.expression;
    while (ts.isPropertyAccessExpression(current)) {
      segments.unshift(current.name.text);
      current = current.expression;
    }
    if (!ts.isIdentifier(current)) {
      return undefined;
    }
    const binding = bindings.get(current.text);
    if (binding === undefined) {
      return undefined;
    }
    return binding.length === 0
      ? { root: current.text, path: segments.join(".") }
      : { root: current.text, path: [binding, ...segments].join(".") };
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const parent = node.parent;
      const nested = parent !== undefined && ts.isPropertyAccessExpression(parent) && parent.expression === node;
      if (!nested) {
        const chain = chainText(node);
        if (chain !== undefined) {
          record(chain.path);
        }
      }
    } else if (
      ts.isIdentifier(node) &&
      node.parent !== undefined &&
      !ts.isPropertyAccessExpression(node.parent) &&
      !ts.isImportSpecifier(node.parent) &&
      !ts.isNamespaceImport(node.parent) &&
      !ts.isImportClause(node.parent)
    ) {
      const binding = bindings.get(node.text);
      if (binding !== undefined && binding.length > 0 && isValuePosition(node)) {
        record(binding);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return counts;
}

function isValuePosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (parent === undefined) {
    return false;
  }
  if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent) || ts.isQualifiedName(parent)) {
    return false;
  }
  if ((ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent)) && parent.name === node) {
    return false;
  }
  if (
    (ts.isParameter(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
    parent.name === node
  ) {
    return false;
  }
  return true;
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

function sortedMemberCounts(counts: Map<string, number>): ApiMemberCount[] {
  return [...counts.entries()]
    .map(([member, count]) => ({ member, count }))
    .toSorted((left, right) => right.count - left.count || left.member.localeCompare(right.member));
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
