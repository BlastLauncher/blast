// Offline, single-file API inventory. No React/Node declarations are loaded.
import {
  parseSync,
  visitorKeys,
  type Node,
  type Statement,
  type TSTypeAnnotation,
} from "oxc-parser";

export const KINDS = [
  "namespace",
  "component",
  "function",
  "const",
  "class",
  "enum",
  "enum-member",
  "interface",
  "type",
  "property",
  "method",
] as const;
export type Kind = (typeof KINDS)[number];
export type Entry = { path: string; kind: Kind; deprecated: boolean; aliasTarget?: string };
export type Inventory = {
  entries: Entry[];
  external: string[];
};
type Declaration = { node: Node; scope: string; deprecated: boolean };
// Standard library types are ambient, rather than dependencies of the API file.
const LIB_GLOBALS = new Set(
  `Array ReadonlyArray ArrayLike ArrayBuffer ArrayBufferLike ArrayBufferView SharedArrayBuffer
  DataView Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array
  Float16Array Float32Array Float64Array BigInt64Array BigUint64Array
  Promise PromiseLike PromiseConstructorLike Awaited PromiseSettledResult PromiseFulfilledResult
  PromiseRejectedResult Map ReadonlyMap WeakMap WeakKey WeakKeyTypes Set ReadonlySet WeakSet
  Iterable IterableIterator Iterator IteratorObject IteratorResult IteratorYieldResult IteratorReturnResult
  AsyncIterable AsyncIterableIterator AsyncIterator AsyncIteratorObject Generator AsyncGenerator
  GeneratorFunction AsyncGeneratorFunction AsyncFunction CallableFunction NewableFunction Function
  Object ObjectConstructor String Number Boolean BigInt Symbol PropertyKey PropertyDescriptor
  PropertyDescriptorMap ThisType ThisParameterType OmitThisParameter Partial Required Readonly
  Pick Record Exclude Extract Omit NonNullable Parameters ConstructorParameters ReturnType InstanceType
  Uppercase Lowercase Capitalize Uncapitalize NoInfer IntrinsicStringManipulationTypes
  Date RegExp RegExpMatchArray RegExpExecArray Error EvalError RangeError ReferenceError SyntaxError
  TypeError URIError AggregateError ErrorOptions SuppressedError Disposable AsyncDisposable
  DisposableStack AsyncDisposableStack WeakRef FinalizationRegistry IArguments TemplateStringsArray
  ImportMeta ImportCallOptions ImportAssertions ImportAttributes TypedPropertyDescriptor
  ConcatArray FlatArray Unscopables JSON Math Reflect Proxy Atomics Intl WebAssembly
  URL URLSearchParams AbortSignal AbortController ReadableStream ReadableStreamDefaultReader
  ReadableStreamBYOBReader ReadableStreamDefaultController ReadableByteStreamController
  WritableStream WritableStreamDefaultWriter WritableStreamDefaultController TransformStream
  TransformStreamDefaultController TextEncoder TextDecoder Blob File FormData Headers Request Response
  RequestInit ResponseInit BufferSource AllowSharedBufferSource Event EventTarget DOMException
  Console Crypto SubtleCrypto MessagePort MessageChannel Worker TimerHandler`.split(/\s+/),
);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function annotation(node: Node): Node | undefined {
  if (node.type === "VariableDeclarator" && node.id.type === "Identifier")
    return (node.id as { typeAnnotation?: TSTypeAnnotation | null }).typeAnnotation?.typeAnnotation;
  if ("typeAnnotation" in node) return node.typeAnnotation ?? undefined;
  return undefined;
}
export function inventory(source: string): Inventory {
  const parsed = parseSync("index.d.ts", source);
  if (parsed.errors.length) throw new Error(parsed.errors.map((error) => error.message).join("\n"));
  const declarations = new Map<string, Declaration[]>();
  const roots: Array<{ path: string; declaration: Declaration }> = [];
  const entries = new Map<string, Entry>();
  const external = new Set<string>();
  const memberAliases: Array<{ path: string; reference: string; scope: string }> = [];
  const deprecated = (node: Node) => {
    const comment = parsed.comments.findLast(
      (candidate) =>
        candidate.end <= node.start && source.slice(candidate.end, node.start).trim() === "",
    );
    return (
      comment?.type === "Block" &&
      comment.value.startsWith("*") &&
      /@deprecated\b/.test(comment.value)
    );
  };
  function name(node: Node): string {
    if (node.type === "Identifier" || node.type === "PrivateIdentifier") return node.name;
    if (node.type === "Literal") return String(node.value);
    if (node.type === "TSQualifiedName") return `${name(node.left)}.${name(node.right)}`;
    return source.slice(node.start, node.end);
  }
  function index(statements: Statement[], scope = "", visible = true) {
    for (const statement of statements) {
      const exported = statement.type === "ExportNamedDeclaration";
      const node = exported ? statement.declaration : statement;
      if (!node) continue;
      const nodes = node.type === "VariableDeclaration" ? node.declarations : [node];
      for (const item of nodes) {
        if (!("id" in item) || !item.id) continue;
        const path = scope ? `${scope}.${name(item.id)}` : name(item.id);
        const declaration = { node: item, scope, deprecated: deprecated(statement) };
        declarations.set(path, [...(declarations.get(path) ?? []), declaration]);
        if (visible && (exported || scope !== "")) roots.push({ path, declaration });
        if (item.type === "TSModuleDeclaration" && item.body?.type === "TSModuleBlock")
          index(item.body.body, path, visible && (exported || scope !== ""));
      }
    }
  }
  index(parsed.program.body);

  function lookup(reference: string, scope: string): Declaration[] {
    for (
      let current = scope;
      ;
      current = current.includes(".") ? current.slice(0, current.lastIndexOf(".")) : ""
    ) {
      const found = declarations.get(current ? `${current}.${reference}` : reference);
      if (found) return found;
      if (!current) return [];
    }
  }
  function resolve(reference: string, scope: string, seen = new Set<Node>()): Declaration[] {
    const direct = lookup(reference, scope);
    if (direct.some(({ node }) => node.type !== "TSModuleDeclaration")) return direct;
    const dot = reference.lastIndexOf(".");
    if (dot < 0) return direct;
    const parents = resolve(reference.slice(0, dot), scope, seen);
    const result: Declaration[] = [];
    for (const parent of parents) {
      for (const member of members(parent.node, parent.scope, seen)) {
        if (
          (("key" in member.node && name(member.node.key)) ||
            (member.node.type === "TSEnumMember" && name(member.node.id))) ===
          reference.slice(dot + 1)
        )
          result.push(member);
      }
    }
    return result.length ? result : direct;
  }
  function members(node: Node, scope: string, seen: Set<Node>): Declaration[] {
    if (seen.has(node)) return [];
    const next = new Set(seen).add(node);
    if (node.type === "TSInterfaceDeclaration")
      return [
        ...node.body.body.map((child) => ({ node: child, scope, deprecated: deprecated(child) })),
        ...node.extends.flatMap((base) => members(base, scope, next)),
      ];
    if (node.type === "TSEnumDeclaration")
      return node.body.members.map((child) => ({
        node: child,
        scope,
        deprecated: deprecated(child),
      }));
    if (node.type === "TSTypeLiteral")
      return node.members.map((child) => ({ node: child, scope, deprecated: deprecated(child) }));
    if (node.type === "TSIntersectionType" || node.type === "TSUnionType")
      return node.types.flatMap((type) => members(type, scope, next));
    if (
      node.type === "TSTypeReference" ||
      node.type === "TSTypeQuery" ||
      node.type === "TSInterfaceHeritage"
    ) {
      const reference = name(
        node.type === "TSTypeReference"
          ? node.typeName
          : node.type === "TSTypeQuery"
            ? node.exprName
            : node.expression,
      );
      return resolve(reference, scope, next).flatMap((decl) =>
        members(decl.node, decl.scope, next),
      );
    }
    const type = annotation(node);
    return type ? members(type, scope, next) : [];
  }
  function classify(node: Node, scope: string, seen = new Set<Node>()): Kind | undefined {
    if (seen.has(node)) return;
    const next = new Set(seen).add(node);
    if (node.type === "TSTypeReference") {
      if (/^(FunctionComponent|ForwardRefExoticComponent|FC)$/.test(name(node.typeName)))
        return "component";
      for (const decl of resolve(name(node.typeName), scope, next)) {
        const kind = classify(
          decl.node.type === "TSTypeAliasDeclaration" ? decl.node.typeAnnotation : decl.node,
          decl.scope,
          next,
        );
        if (kind === "component") return kind;
      }
    }
    if (node.type === "TSTypeQuery") {
      for (const decl of resolve(name(node.exprName), scope, next)) {
        const kind = classify(decl.node, decl.scope, next);
        if (kind && kind !== "namespace") return kind;
      }
    }
    if (node.type === "TSIntersectionType") {
      for (const type of node.types)
        if (classify(type, scope, next) === "component") return "component";
    }
    if (node.type === "TSEnumMember") return "enum-member";
    if (node.type === "TSModuleDeclaration") return "namespace";
    if (node.type === "TSDeclareFunction" || node.type === "FunctionDeclaration") return "function";
    if (node.type === "ClassDeclaration") return "class";
    if (node.type === "TSEnumDeclaration") return "enum";
    if (node.type === "TSInterfaceDeclaration") return "interface";
    if (node.type === "TSTypeAliasDeclaration") return "type";
    if (node.type === "TSMethodSignature" || node.type === "MethodDefinition")
      return node.kind === "get" || node.kind === "set" ? "property" : "method";
    const type = annotation(node);
    if (type) {
      const kind = classify(type, scope, next);
      if (
        kind === "component" ||
        (node.type === "VariableDeclarator" &&
          (kind === "enum" || kind === "class" || kind === "function"))
      )
        return kind;
    }
    if (node.type === "VariableDeclarator") return "const";
    if ("key" in node) return "property";
  }
  function add(path: string, kind: Kind, isDeprecated: boolean) {
    const old = entries.get(path);
    // Declaration merging gets one denominator entry; the runtime value wins.
    const priority = (value: Kind) =>
      value === "namespace" ? 0 : value === "type" || value === "interface" ? 1 : 2;
    entries.set(path, {
      path,
      kind: old && priority(old.kind) >= priority(kind) ? old.kind : kind,
      deprecated: isDeprecated || old?.deprecated || false,
    });
  }
  function expand(
    node: Node,
    path: string,
    scope: string,
    seen: Set<Node>,
    enumValue = true,
    followNamed = true,
    inheritedDeprecated = false,
  ) {
    if (seen.has(node)) return;
    const next = new Set(seen).add(node);
    if (node.type === "TSModuleDeclaration") return; // Exported namespace children are indexed separately.
    if (node.type === "TSEnumDeclaration") {
      if (!enumValue) return;
      for (const member of node.body.members)
        add(`${path}.${name(member.id)}`, "enum-member", inheritedDeprecated || deprecated(member));
      return;
    }
    if (
      node.type === "TSTypeReference" ||
      node.type === "TSTypeQuery" ||
      node.type === "TSInterfaceHeritage"
    ) {
      if (!followNamed) return;
      const reference = name(
        node.type === "TSTypeReference"
          ? node.typeName
          : node.type === "TSTypeQuery"
            ? node.exprName
            : node.expression,
      );
      const targets = resolve(reference, scope);
      if (
        /^(FunctionComponent|ForwardRefExoticComponent|FC)$/.test(reference) &&
        "typeArguments" in node
      ) {
        const props = node.typeArguments?.params[0];
        if (props) {
          add(`${path}.Props`, "type", inheritedDeprecated);
          expand(props, `${path}.Props`, scope, next, true, true, inheritedDeprecated);
        }
      }
      for (const target of targets)
        expand(
          target.node,
          path,
          target.scope,
          next,
          node.type === "TSTypeQuery",
          true,
          inheritedDeprecated || target.deprecated,
        );
      return;
    }
    if (node.type === "TSIntersectionType" || node.type === "TSUnionType") {
      for (const type of node.types)
        expand(type, path, scope, next, enumValue, followNamed, inheritedDeprecated);
      return;
    }
    if (node.type === "TSInterfaceDeclaration")
      for (const base of node.extends)
        expand(base, path, scope, next, true, true, inheritedDeprecated);
    const children =
      node.type === "TSInterfaceDeclaration"
        ? node.body.body
        : node.type === "TSTypeLiteral"
          ? node.members
          : node.type === "ClassDeclaration"
            ? node.body.body
            : [];
    for (const child of children) {
      if (
        !("key" in child) ||
        ("accessibility" in child &&
          (child.accessibility === "private" || child.accessibility === "protected")) ||
        child.key.type === "PrivateIdentifier"
      )
        continue;
      const childPath = `${path}.${name(child.key)}`;
      const kind = classify(child, scope) ?? "property";
      const childDeprecated = inheritedDeprecated || deprecated(child);
      add(childPath, kind, childDeprecated);
      const childAnnotation = annotation(child);
      const childType =
        childAnnotation?.type === "TSTypeAnnotation"
          ? childAnnotation.typeAnnotation
          : childAnnotation;
      if (childType?.type === "TSTypeQuery")
        memberAliases.push({ path: childPath, reference: name(childType.exprName), scope });
      // Components and typeof values expose runtime members. Ordinary data
      // properties stop at named types, whose members have their own paths.
      expand(
        child,
        childPath,
        scope,
        next,
        true,
        kind === "component" || annotation(child)?.type === "TSTypeQuery",
        childDeprecated,
      );
    }
    const type = annotation(node);
    if (type) expand(type, path, scope, next, enumValue, followNamed, inheritedDeprecated);
  }
  // Inspect references in signatures too, without turning return types into members.
  const scanned = new Set<Node>();
  function references(node: Node, scope: string, parameters = new Set<string>()) {
    if (scanned.has(node)) return;
    scanned.add(node);
    const locals = new Set(parameters);
    if (node.type === "TSMappedType") locals.add(node.key.name);
    if (node.type === "TSConditionalType") {
      const infer = (child: Node) => {
        if (child.type === "TSInferType") locals.add(child.typeParameter.name.name);
        for (const key of visitorKeys[child.type] ?? []) {
          const value = (child as unknown as Record<string, unknown>)[key];
          for (const nested of Array.isArray(value) ? value : [value])
            if (nested && typeof nested === "object" && "type" in nested) infer(nested as Node);
        }
      };
      infer(node.extendsType);
    }
    if ("typeParameters" in node)
      for (const param of node.typeParameters?.params ?? []) locals.add(param.name.name);
    if (node.type === "TSTypeReference" || node.type === "TSTypeQuery") {
      const reference = name(node.type === "TSTypeReference" ? node.typeName : node.exprName);
      const targets = resolve(reference, scope);
      if (
        !locals.has(reference.split(".")[0]!) &&
        !targets.length &&
        !LIB_GLOBALS.has(reference.split(".")[0]!)
      )
        external.add(reference);
      for (const target of targets) references(target.node, target.scope);
    }
    for (const key of visitorKeys[node.type] ?? []) {
      const value = (node as unknown as Record<string, unknown>)[key];
      for (const child of Array.isArray(value) ? value : [value])
        if (child && typeof child === "object" && "type" in child)
          references(child as Node, scope, locals);
    }
  }
  for (const { path, declaration } of roots) {
    add(path, classify(declaration.node, declaration.scope) ?? "const", declaration.deprecated);
    expand(
      declaration.node,
      path,
      declaration.scope,
      new Set(),
      true,
      true,
      declaration.deprecated,
    );
  }
  for (const { declaration } of roots)
    if (declaration.node.type !== "TSModuleDeclaration")
      references(declaration.node, declaration.scope);
  const sorted = [...entries.values()].toSorted((a, b) => compare(a.path, b.path));
  for (const {
    path,
    declaration: { node, scope },
  } of roots) {
    const type =
      node.type === "TSInterfaceDeclaration"
        ? node.body.body.length === 0 && node.extends.length === 1
          ? node.extends[0]
          : undefined
        : annotation(node);
    if (node.type === "VariableDeclarator" && type?.type !== "TSTypeQuery") continue;
    const reference =
      type?.type === "TSTypeQuery"
        ? name(type.exprName)
        : type?.type === "TSTypeReference"
          ? name(type.typeName)
          : type?.type === "TSInterfaceHeritage"
            ? name(type.expression)
            : undefined;
    if (!reference) continue;
    memberAliases.push({ path, reference, scope });
  }
  for (const { path, reference, scope } of memberAliases) {
    for (
      let current = scope;
      ;
      current = current.includes(".") ? current.slice(0, current.lastIndexOf(".")) : ""
    ) {
      const target = current ? `${current}.${reference}` : reference;
      if ((entries.has(target) || declarations.has(target)) && target !== path) {
        entries.get(path)!.aliasTarget = target;
        break;
      }
      if (!current) break;
    }
  }
  // Namespace roots and merged declarations contribute deprecation independently.
  for (const entry of sorted) {
    const parts = entry.path.split(".");
    for (let i = 1; i < parts.length; i++)
      if (entries.get(parts.slice(0, i).join("."))?.deprecated) entry.deprecated = true;
  }
  return { entries: sorted, external: [...external].toSorted(compare) };
}
