import path from "node:path";

import ts from "typescript";

export const DECLARATION_INVENTORY_SCHEMA_VERSION = 1;

export type DeclarationMemberKind = "namespace" | "type" | "value";

export interface DeclarationMember {
  readonly path: string;
  readonly kinds: readonly DeclarationMemberKind[];
}

export interface DeclarationInventory {
  readonly topLevel: readonly DeclarationMember[];
  readonly nested: readonly DeclarationMember[];
}

export interface DeclarationInventorySource {
  readonly label: string;
  readonly topLevel: readonly DeclarationMember[];
  readonly nested: readonly DeclarationMember[];
  readonly totalMembers: number;
}

export interface DeclarationMemberComparison {
  readonly expected: number;
  readonly matched: number;
  readonly coverage: number;
  readonly missing: readonly DeclarationMember[];
  readonly extra: readonly DeclarationMember[];
}

export interface DeclarationObservedImports {
  readonly imports: readonly string[];
  readonly apiNames: readonly string[];
  readonly declaredApiNames: readonly string[];
  readonly adapterOnlyApiNames: readonly string[];
  readonly unrepresentedApiNames: readonly string[];
}

export interface DeclarationRuntimeExports {
  readonly expected: readonly string[];
  readonly actual: readonly string[];
  readonly missing: readonly string[];
  readonly extra: readonly string[];
}

export interface DeclarationCompatibilityOptions {
  readonly raycastDeclarationPath: string;
  readonly adapterDeclarationPath: string;
  readonly raycastLabel?: string;
  readonly adapterLabel?: string;
  readonly observedApiImports?: readonly string[];
  readonly adapterRuntimeExports?: readonly string[];
}

export interface DeclarationCompatibilityReport {
  readonly schemaVersion: number;
  readonly raycast: DeclarationInventorySource;
  readonly adapter: DeclarationInventorySource;
  readonly comparison: {
    readonly topLevel: DeclarationMemberComparison;
    readonly nested: DeclarationMemberComparison;
    readonly missing: readonly DeclarationMember[];
    readonly extra: readonly DeclarationMember[];
  };
  readonly observed: DeclarationObservedImports;
  readonly runtime?: DeclarationRuntimeExports;
  readonly finishLine: {
    readonly declarationShapeCoverage: number;
    readonly staticImportBlockers: readonly string[];
    readonly runtimeExportBlockers: readonly string[];
    readonly passed: boolean;
  };
}

interface MutableDeclarationMember {
  readonly path: string;
  readonly kinds: Set<DeclarationMemberKind>;
}

interface DeclarationInventoryContext {
  readonly checker: ts.TypeChecker;
  readonly sourceFile: ts.SourceFile;
  readonly members: Map<string, MutableDeclarationMember>;
  readonly visited: Set<string>;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowJs: false,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
};

const IGNORED_MEMBER_NAMES = new Set(["$$typeof", "constructor", "displayName", "propTypes", "prototype"]);
const VALUE_FLAGS =
  ts.SymbolFlags.Variable |
  ts.SymbolFlags.Function |
  ts.SymbolFlags.Class |
  ts.SymbolFlags.Enum |
  ts.SymbolFlags.EnumMember |
  ts.SymbolFlags.Method |
  ts.SymbolFlags.Property |
  ts.SymbolFlags.GetAccessor |
  ts.SymbolFlags.SetAccessor |
  ts.SymbolFlags.ValueModule;
const TYPE_FLAGS = ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeParameter;
const NAMESPACE_FLAGS = ts.SymbolFlags.Namespace | ts.SymbolFlags.ValueModule;

/**
 * Reads the public declaration surface of one TypeScript module. Runtime
 * value properties, merged namespace members, enum members, and public class
 * members are included; compiler-generated React/class metadata is omitted.
 */
export function buildDeclarationInventory(declarationPath: string): DeclarationInventory {
  const absolutePath = path.resolve(declarationPath);
  const program = ts.createProgram([absolutePath], COMPILER_OPTIONS);
  const sourceFile = findSourceFile(program, absolutePath);
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) {
    throw new Error(`The declaration file is not an external module: ${declarationPath}`);
  }

  const context: DeclarationInventoryContext = {
    checker,
    sourceFile,
    members: new Map(),
    visited: new Set(),
  };
  const topLevel = new Map<string, MutableDeclarationMember>();

  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = resolveSymbol(checker, exported);
    addMember(topLevel, symbol.name, symbolKinds(symbol));
    collectNestedMembers(context, symbol, symbol.name, 0);
  }

  return {
    topLevel: freezeMembers(topLevel),
    nested: freezeMembers(context.members),
  };
}

/**
 * Compares the pinned Raycast declaration with the adapter's emitted public
 * declaration and returns a deterministic report suitable for a committed
 * compatibility artifact.
 */
export function buildDeclarationCompatibilityReport(
  options: DeclarationCompatibilityOptions,
): DeclarationCompatibilityReport {
  const raycastInventory = buildDeclarationInventory(options.raycastDeclarationPath);
  const adapterInventory = buildDeclarationInventory(options.adapterDeclarationPath);
  const raycast = createSourceSummary(
    options.raycastLabel ?? path.basename(options.raycastDeclarationPath),
    raycastInventory,
  );
  const adapter = createSourceSummary(
    options.adapterLabel ?? path.basename(options.adapterDeclarationPath),
    adapterInventory,
  );

  const topLevel = compareMembers(raycast.topLevel, adapter.topLevel);
  const nested = compareMembers(raycast.nested, adapter.nested);
  const missing = [...topLevel.missing, ...nested.missing].toSorted(compareMembersByPath);
  const extra = [...topLevel.extra, ...nested.extra].toSorted(compareMembersByPath);
  const observed = compareObservedImports(
    options.observedApiImports ?? [],
    new Set(raycast.topLevel.map((member) => member.path)),
    new Set(adapter.topLevel.map((member) => member.path)),
  );
  const expectedMembers = raycast.totalMembers;
  const matchedMembers = expectedMembers - missing.length;
  const declarationShapeCoverage = expectedMembers === 0 ? 1 : matchedMembers / expectedMembers;
  const staticImportBlockers = observed.unrepresentedApiNames;
  const runtime =
    options.adapterRuntimeExports === undefined
      ? undefined
      : compareRuntimeExports(raycast, raycastInventory, options.adapterRuntimeExports);
  const runtimeExportBlockers = runtime?.missing ?? [];

  return {
    schemaVersion: DECLARATION_INVENTORY_SCHEMA_VERSION,
    raycast,
    adapter,
    comparison: { topLevel, nested, missing, extra },
    observed,
    ...(runtime === undefined ? {} : { runtime }),
    finishLine: {
      declarationShapeCoverage,
      staticImportBlockers,
      runtimeExportBlockers,
      passed: missing.length === 0 && staticImportBlockers.length === 0 && runtimeExportBlockers.length === 0,
    },
  };
}

function findSourceFile(program: ts.Program, absolutePath: string): ts.SourceFile {
  const sourceFile = program.getSourceFile(absolutePath);
  if (sourceFile !== undefined) {
    return sourceFile;
  }
  const normalizedPath = path.normalize(absolutePath);
  const fallback = program.getSourceFiles().find((candidate) => path.normalize(candidate.fileName) === normalizedPath);
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Unable to read declaration file: ${absolutePath}`);
}

function collectNestedMembers(
  context: DeclarationInventoryContext,
  rawSymbol: ts.Symbol,
  parentPath: string,
  depth: number,
): void {
  if (depth > 5) {
    return;
  }
  const symbol = resolveSymbol(context.checker, rawSymbol);
  const visitKey = `${symbolKey(symbol)}:${parentPath}:${depth}`;
  if (context.visited.has(visitKey)) {
    return;
  }
  context.visited.add(visitKey);

  if (isNamespaceLike(symbol) || symbol.flags & ts.SymbolFlags.Enum || symbol.flags & ts.SymbolFlags.Class) {
    for (const exported of safeModuleExports(context.checker, symbol)) {
      const child = resolveSymbol(context.checker, exported);
      const childPath = `${parentPath}.${child.name}`;
      if (isIgnoredMember(child.name)) {
        continue;
      }
      addMember(context.members, childPath, symbolKinds(child));
      if (shouldRecurseIntoValue(context, child)) {
        collectNestedMembers(context, child, childPath, depth + 1);
      }
    }
  }

  if (isValueLike(symbol)) {
    const valueType = getTypeOfSymbol(context.checker, symbol, context.sourceFile);
    if (valueType !== undefined) {
      for (const property of context.checker.getPropertiesOfType(valueType)) {
        addRuntimeMember(context, property, parentPath, depth);
      }
      if (context.checker.getIndexTypeOfType(valueType, ts.IndexKind.String) !== undefined) {
        addMember(context.members, `${parentPath}.*`, ["value"]);
      }
    }
  }

  if (symbol.flags & ts.SymbolFlags.Class) {
    const instanceType = getDeclaredTypeOfClass(context.checker, symbol);
    if (instanceType !== undefined) {
      for (const property of context.checker.getPropertiesOfType(instanceType)) {
        addRuntimeMember(context, property, parentPath, depth);
      }
    }
  }
}

function addRuntimeMember(
  context: DeclarationInventoryContext,
  property: ts.Symbol,
  parentPath: string,
  depth: number,
): void {
  const resolvedProperty = resolveSymbol(context.checker, property);
  if (isIgnoredMember(resolvedProperty.name) || isNonPublic(resolvedProperty)) {
    return;
  }
  const propertyPath = `${parentPath}.${resolvedProperty.name}`;
  addMember(context.members, propertyPath, ["value"]);
  if (shouldRecurseIntoValue(context, resolvedProperty)) {
    collectNestedMembers(context, resolvedProperty, propertyPath, depth + 1);
  }
}

function shouldRecurseIntoValue(context: DeclarationInventoryContext, symbol: ts.Symbol): boolean {
  if (isNamespaceLike(symbol) || symbol.flags & ts.SymbolFlags.Enum || symbol.flags & ts.SymbolFlags.Class) {
    return true;
  }
  if (!isValueLike(symbol)) {
    return false;
  }
  const type = getTypeOfSymbol(context.checker, symbol, context.sourceFile);
  return type !== undefined && Boolean(type.flags & ts.TypeFlags.Object);
}

function isNonPublic(symbol: ts.Symbol): boolean {
  return Boolean(
    symbol.declarations?.some((declaration) => {
      const name = (declaration as ts.NamedDeclaration).name;
      if (name !== undefined && ts.isPrivateIdentifier(name)) {
        return true;
      }
      const modifiers = ts.getCombinedModifierFlags(declaration);
      return Boolean(modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected));
    }),
  );
}

function getTypeOfSymbol(checker: ts.TypeChecker, symbol: ts.Symbol, fallback: ts.SourceFile): ts.Type | undefined {
  try {
    return checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? symbol.declarations?.[0] ?? fallback);
  } catch {
    return undefined;
  }
}

function getDeclaredTypeOfClass(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Type | undefined {
  try {
    return checker.getDeclaredTypeOfSymbol(symbol);
  } catch {
    return undefined;
  }
}

function safeModuleExports(checker: ts.TypeChecker, symbol: ts.Symbol): readonly ts.Symbol[] {
  try {
    return checker.getExportsOfModule(symbol);
  } catch {
    return [];
  }
}

function resolveSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  if ((symbol.flags & ts.SymbolFlags.Alias) === 0) {
    return symbol;
  }
  try {
    return checker.getAliasedSymbol(symbol);
  } catch {
    return symbol;
  }
}

function symbolKinds(symbol: ts.Symbol): DeclarationMemberKind[] {
  const kinds: DeclarationMemberKind[] = [];
  if (symbol.flags & NAMESPACE_FLAGS) {
    kinds.push("namespace");
  }
  if (symbol.flags & VALUE_FLAGS) {
    kinds.push("value");
  }
  if (symbol.flags & TYPE_FLAGS || kinds.length === 0) {
    kinds.push("type");
  }
  return kinds;
}

function isNamespaceLike(symbol: ts.Symbol): boolean {
  return (
    Boolean(symbol.flags & NAMESPACE_FLAGS) ||
    Boolean(symbol.declarations?.some((node) => ts.isModuleDeclaration(node)))
  );
}

function isValueLike(symbol: ts.Symbol): boolean {
  return Boolean(symbol.flags & VALUE_FLAGS) && Boolean(symbol.valueDeclaration ?? symbol.declarations?.[0]);
}

function isIgnoredMember(name: string): boolean {
  return IGNORED_MEMBER_NAMES.has(name);
}

function addMember(
  members: Map<string, MutableDeclarationMember>,
  memberPath: string,
  kinds: readonly DeclarationMemberKind[],
): void {
  const existing = members.get(memberPath);
  if (existing === undefined) {
    members.set(memberPath, { path: memberPath, kinds: new Set(kinds) });
    return;
  }
  for (const kind of kinds) {
    existing.kinds.add(kind);
  }
}

function freezeMembers(members: Map<string, MutableDeclarationMember>): DeclarationMember[] {
  return [...members.values()]
    .map((member) => ({
      path: member.path,
      kinds: [...member.kinds].toSorted(compareKinds),
    }))
    .toSorted(compareMembersByPath);
}

function compareMembers(
  expected: readonly DeclarationMember[],
  actual: readonly DeclarationMember[],
): DeclarationMemberComparison {
  const actualPaths = new Set(actual.map((member) => member.path));
  const expectedByPath = new Map(expected.map((member) => [member.path, member]));
  const missing = expected.filter((member) => !isCoveredMember(member.path, actualPaths));
  const extra = actual.filter((member) => !expectedByPath.has(member.path));
  return {
    expected: expected.length,
    matched: expected.length - missing.length,
    coverage: expected.length === 0 ? 1 : (expected.length - missing.length) / expected.length,
    missing,
    extra,
  };
}

function isCoveredMember(memberPath: string, actualPaths: ReadonlySet<string>): boolean {
  if (actualPaths.has(memberPath)) {
    return true;
  }
  const segments = memberPath.split(".");
  for (let length = segments.length - 1; length > 0; length -= 1) {
    if (actualPaths.has(`${segments.slice(0, length).join(".")}.*`)) {
      return true;
    }
  }
  return false;
}

function compareObservedImports(
  imports: readonly string[],
  declaredApiNames: ReadonlySet<string>,
  adapterApiNames: ReadonlySet<string>,
): DeclarationObservedImports {
  const sortedImports = [...new Set(imports)].toSorted(compareStrings);
  const apiNames = sortedImports.filter((name) => !name.startsWith("<"));
  return {
    imports: sortedImports,
    apiNames,
    declaredApiNames: apiNames.filter((name) => declaredApiNames.has(name)),
    adapterOnlyApiNames: apiNames.filter((name) => !declaredApiNames.has(name) && adapterApiNames.has(name)),
    unrepresentedApiNames: apiNames.filter((name) => !adapterApiNames.has(name)),
  };
}

function compareRuntimeExports(
  source: DeclarationInventorySource,
  inventory: DeclarationInventory,
  actualExports: readonly string[],
): DeclarationRuntimeExports {
  const nestedValuePaths = new Set(
    inventory.nested.filter((member) => member.kinds.includes("value")).map((member) => member.path),
  );
  const expected = source.topLevel
    .filter(
      (member) =>
        member.kinds.includes("value") || [...nestedValuePaths].some((path) => path.startsWith(`${member.path}.`)),
    )
    .map((member) => member.path)
    .toSorted(compareStrings);
  const actual = [...new Set(actualExports)].toSorted(compareStrings);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    expected,
    actual,
    missing: expected.filter((name) => !actualSet.has(name)),
    extra: actual.filter((name) => !expectedSet.has(name)),
  };
}

function createSourceSummary(label: string, inventory: DeclarationInventory): DeclarationInventorySource {
  return {
    label,
    topLevel: inventory.topLevel,
    nested: inventory.nested,
    totalMembers: inventory.topLevel.length + inventory.nested.length,
  };
}

function symbolKey(symbol: ts.Symbol): string {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  return `${symbol.name}:${declaration?.getSourceFile().fileName ?? "unknown"}:${declaration?.pos ?? -1}`;
}

function compareMembersByPath(left: DeclarationMember, right: DeclarationMember): number {
  return compareStrings(left.path, right.path);
}

function compareKinds(left: DeclarationMemberKind, right: DeclarationMemberKind): number {
  const order: Record<DeclarationMemberKind, number> = { namespace: 0, type: 1, value: 2 };
  return order[left] - order[right];
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
