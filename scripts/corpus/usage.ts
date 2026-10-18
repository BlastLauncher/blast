// Syntactic import-name resolution only: no module loading or extension execution.
import { parseSync, visitorKeys, type Node } from "oxc-parser";
import type { Source } from "./imports.ts";

export type ExtensionUsage = { paths: string[]; utils: boolean; failures: string[] };
export type Usage = { corpusCommit: string; extensions: number; paths: Record<string, number> };
export const USAGE_PATH = "compat/raycast-usage.json";

function* children(node: Node): Generator<Node> {
  const record = node as unknown as Record<string, unknown>;
  for (const key of visitorKeys[node.type] ?? []) {
    const value = record[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === "object" && "type" in child) yield child as Node;
    }
  }
}

/** Files share an extension-level set, but never share import bindings. */
export function scanExtension(
  sources: Iterable<Source>,
  known: ReadonlySet<string>,
): ExtensionUsage {
  const paths = new Set<string>();
  const failures: string[] = [];
  let utils = false;
  const add = (path: string | undefined) => {
    if (path !== undefined && known.has(path)) paths.add(path);
  };
  for (const { file, source } of sources) {
    const parsed = parseSync(file, source);
    if (parsed.errors.length) {
      failures.push(`${file}: ${parsed.errors.map((error) => error.message).join("; ")}`);
      continue;
    }
    const bindings = new Map<string, string>();
    for (const node of parsed.program.body) {
      if (node.type !== "ImportDeclaration") continue;
      if (node.source.value === "@raycast/utils") utils = true;
      if (node.source.value !== "@raycast/api") continue;
      for (const spec of node.specifiers) {
        if (spec.type === "ImportNamespaceSpecifier") bindings.set(spec.local.name, "");
        if (spec.type === "ImportSpecifier") {
          const name =
            spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
          bindings.set(spec.local.name, name);
          add(name);
        }
      }
    }
    const resolve = (node: Node): string | undefined => {
      if (node.type === "Identifier" || node.type === "JSXIdentifier")
        return bindings.get(node.name);
      let base: string | undefined;
      let member: string | undefined;
      if (node.type === "MemberExpression") {
        base = resolve(node.object);
        if (!node.computed && node.property.type === "Identifier") member = node.property.name;
        if (
          node.computed &&
          node.property.type === "Literal" &&
          typeof node.property.value === "string"
        )
          member = node.property.value;
      } else if (node.type === "JSXMemberExpression") {
        base = resolve(node.object);
        member = node.property.name;
      } else if (node.type === "TSQualifiedName") {
        base = resolve(node.left);
        member = node.right.name;
      }
      return base === undefined || member === undefined
        ? undefined
        : base
          ? `${base}.${member}`
          : member;
    };
    const visit = (node: Node): void => {
      if (["MemberExpression", "JSXMemberExpression", "TSQualifiedName"].includes(node.type))
        add(resolve(node));
      if (node.type === "JSXOpeningElement") {
        const component = resolve(node.name);
        add(component);
        if (component !== undefined) {
          for (const attr of node.attributes) {
            if (attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier")
              add(`${component}.Props.${attr.name.name}`);
          }
        }
      }
      for (const child of children(node)) visit(child);
    };
    visit(parsed.program);
  }
  return { paths: [...paths].toSorted(), utils, failures };
}

export function aggregateUsage(
  commit: string,
  known: ReadonlySet<string>,
  extensions: ExtensionUsage[],
): Usage {
  const counts = new Map([...known].map((path) => [path, 0]));
  for (const extension of extensions) {
    for (const path of new Set(extension.paths)) {
      if (counts.has(path)) counts.set(path, counts.get(path)! + 1);
    }
  }
  return {
    corpusCommit: commit,
    extensions: extensions.length,
    paths: Object.fromEntries([...counts].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
}
