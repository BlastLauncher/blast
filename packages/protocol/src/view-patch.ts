// Generic JSON view diff and patch for embedder protocol 2 (decision 0020).
// Pure, dependency-free, JSON-only: objects recurse key by key, arrays become
// at most one prefix/suffix splice (or `set` when the whole array changes),
// and all other differences become `set`.

import type { JsonValue } from "./messages.ts";

/** One generic JSON patch operation against a serialized view (decision 0020). */
export type ViewPatchOp =
  | { op: "set"; path: string[]; value: JsonValue }
  | { op: "delete"; path: string[] }
  | { op: "splice"; path: string[]; at: number; remove: number; insert: JsonValue[] };

/** A patch bundle applied by `applyViewPatch`; revisions are checked when supplied. */
export type ViewPatch = {
  revision?: number;
  baseRevision?: number;
  ops: readonly ViewPatchOp[];
};

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function setOwn(target: Record<string, JsonValue>, key: string, value: JsonValue): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  } else {
    target[key] = value;
  }
}

/** Clones a JSON-compatible value, stripping `undefined` object keys to match wire JSON. */
function cloneJson(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in view: ${value}`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : cloneJson(item)));
  }
  if (isPlainObject(value)) {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (item !== undefined) setOwn(out, key, cloneJson(item));
    }
    return out;
  }
  throw new Error(`Unsupported value type in view: ${typeof value}`);
}

/** Structural equality over JSON values; ignores `undefined` object keys like JSON.stringify. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b) || !isPlainObject(a) || !isPlainObject(b)) return false;
  let countA = 0;
  for (const key of Object.keys(a)) {
    const valA = a[key];
    if (valA === undefined) continue;
    countA++;
    if (!Object.hasOwn(b, key) || b[key] === undefined || !deepEqual(valA, b[key])) return false;
  }
  let countB = 0;
  for (const key of Object.keys(b)) {
    if (b[key] !== undefined) countB++;
  }
  return countA === countB;
}

function diffInto(prev: unknown, next: unknown, path: string[], ops: ViewPatchOp[]): void {
  if (prev === next) return;
  if (isPlainObject(prev) && isPlainObject(next)) {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) continue;
      if (!Object.hasOwn(next, key) || next[key] === undefined) {
        ops.push({ op: "delete", path: [...path, key] });
      }
    }
    for (const key of Object.keys(next)) {
      const nextVal = next[key];
      if (nextVal === undefined) continue;
      if (!Object.hasOwn(prev, key) || prev[key] === undefined) {
        ops.push({ op: "set", path: [...path, key], value: cloneJson(nextVal) });
      } else {
        diffInto(prev[key], nextVal, [...path, key], ops);
      }
    }
    return;
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    let prefix = 0;
    while (prefix < prev.length && prefix < next.length && deepEqual(prev[prefix], next[prefix])) {
      prefix++;
    }
    if (prefix === prev.length && prefix === next.length) return;
    let suffix = 0;
    while (
      suffix < prev.length - prefix &&
      suffix < next.length - prefix &&
      deepEqual(prev[prev.length - 1 - suffix], next[next.length - 1 - suffix])
    ) {
      suffix++;
    }
    // A splice covering the entire array is sent as `set` (decision 0020).
    if (prefix === 0 && suffix === 0) {
      ops.push({ op: "set", path, value: cloneJson(next) });
      return;
    }
    const remove = prev.length - prefix - suffix;
    const insert = next
      .slice(prefix, next.length - suffix)
      .map((item) => (item === undefined ? null : cloneJson(item)));
    ops.push({ op: "splice", path, at: prefix, remove, insert });
    return;
  }
  if (!deepEqual(prev, next)) {
    ops.push({ op: "set", path, value: cloneJson(next) });
  }
}

/** Computes the minimal protocol-2 patch ops to transform `prev` into `next`. */
export function diffView(prev: unknown, next: unknown): ViewPatchOp[] {
  const ops: ViewPatchOp[] = [];
  diffInto(prev, next, [], ops);
  return ops;
}

function formatPath(path: readonly string[]): string {
  return path.length === 0 ? "<root>" : path.join(".");
}

function shallowCopyObject(object: PlainObject): Record<string, JsonValue> {
  const copy: Record<string, JsonValue> = {};
  for (const key of Object.keys(object)) {
    const val = object[key];
    if (val !== undefined) setOwn(copy, key, val as JsonValue);
  }
  return copy;
}

function applyAt(
  node: JsonValue,
  path: readonly string[],
  depth: number,
  leaf: (target: JsonValue) => JsonValue,
): JsonValue {
  if (depth === path.length) return leaf(node);
  if (!isPlainObject(node)) {
    throw new Error(`Path does not exist: ${formatPath(path)}`);
  }
  const key = path[depth]!;
  // For `set` at the final segment, the leaf key may be newly added.
  const isFinal = depth === path.length - 1;
  if (!isFinal && (!Object.hasOwn(node, key) || node[key] === undefined)) {
    throw new Error(`Path does not exist: ${formatPath(path)}`);
  }
  const copy = shallowCopyObject(node);
  const child = Object.hasOwn(node, key)
    ? (node[key] as JsonValue)
    : (undefined as unknown as JsonValue);
  const updated = applyAt(child, path, depth + 1, leaf);
  setOwn(copy, key, updated);
  return copy;
}

function applyOp(root: JsonValue, op: ViewPatchOp): JsonValue {
  if (op.op === "set") {
    const value = cloneJson(op.value);
    if (op.path.length === 0) return value;
    return applyAt(root, op.path, 0, () => value);
  }
  if (op.op === "delete") {
    if (op.path.length === 0) throw new Error("Cannot delete view root");
    const parentPath = op.path.slice(0, -1);
    const key = op.path[op.path.length - 1]!;
    const applyDelete = (target: JsonValue): JsonValue => {
      if (!isPlainObject(target) || !Object.hasOwn(target, key) || target[key] === undefined) {
        throw new Error(`Path does not exist: ${formatPath(op.path)}`);
      }
      const copy = shallowCopyObject(target);
      delete copy[key];
      return copy;
    };
    return parentPath.length === 0 ? applyDelete(root) : applyAt(root, parentPath, 0, applyDelete);
  }
  if (op.op === "splice") {
    const applySplice = (target: JsonValue): JsonValue => {
      if (target === undefined) {
        throw new Error(`Path does not exist: ${formatPath(op.path)}`);
      }
      if (!Array.isArray(target)) {
        throw new Error(`Splice target is not an array: ${formatPath(op.path)}`);
      }
      const { at, remove, insert } = op;
      if (!Number.isInteger(at) || at < 0 || at > target.length) {
        throw new Error(`Splice index out of bounds: ${at} (length ${target.length})`);
      }
      if (!Number.isInteger(remove) || remove < 0 || at + remove > target.length) {
        throw new Error(
          `Splice remove count out of bounds: ${remove} at ${at} (length ${target.length})`,
        );
      }
      const next = target.slice();
      next.splice(at, remove, ...insert.map((item) => cloneJson(item)));
      return next;
    };
    if (op.path.length === 0) return applySplice(root);
    // Require the target key itself to exist before delegating to applySplice.
    const parentPath = op.path.slice(0, -1);
    const key = op.path[op.path.length - 1]!;
    const spliceInParent = (parent: JsonValue): JsonValue => {
      if (!isPlainObject(parent) || !Object.hasOwn(parent, key) || parent[key] === undefined) {
        throw new Error(`Path does not exist: ${formatPath(op.path)}`);
      }
      const copy = shallowCopyObject(parent);
      setOwn(copy, key, applySplice(parent[key] as JsonValue));
      return copy;
    };
    return parentPath.length === 0
      ? spliceInParent(root)
      : applyAt(root, parentPath, 0, spliceInParent);
  }
  throw new Error(`Unknown view patch op: ${(op as { op?: unknown }).op}`);
}

/**
 * Purely applies a protocol-2 view patch without mutating `view`.
 * Checks `patch.baseRevision === currentRevision` when `currentRevision` is supplied,
 * and throws on any missing path, non-array splice target, or out-of-bounds splice.
 */
export function applyViewPatch<T = JsonValue>(
  view: unknown,
  patch: ViewPatch,
  currentRevision?: number,
): T {
  if (currentRevision !== undefined) {
    if (!Number.isInteger(currentRevision) || currentRevision < 1) {
      throw new Error(`Invalid currentRevision: ${currentRevision}`);
    }
    if (patch.baseRevision === undefined) {
      throw new Error(`View patch missing baseRevision (expected ${currentRevision})`);
    }
    if (patch.baseRevision !== currentRevision) {
      throw new Error(
        `View patch baseRevision mismatch: expected ${currentRevision}, got ${patch.baseRevision}`,
      );
    }
  }
  if (
    patch.baseRevision !== undefined &&
    patch.revision !== undefined &&
    patch.revision !== patch.baseRevision + 1
  ) {
    throw new Error(
      `View patch revision mismatch: expected ${patch.baseRevision + 1}, got ${patch.revision}`,
    );
  }
  let current = view as JsonValue;
  for (const op of patch.ops) {
    current = applyOp(current, op);
  }
  return current as T;
}
