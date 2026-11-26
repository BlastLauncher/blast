import { isValidElement } from "react";
import { UnsupportedApiError, unsupportedPath } from "../api/unsupported.ts";
import type { JsonValue } from "./types.ts";

export type Handler = (...args: unknown[]) => unknown;

export function serializeProps(
  type: string,
  props: Record<string, unknown>,
  handlers: Map<string, Handler>,
  warn: (message: string) => void,
): Record<string, JsonValue> {
  let ancestors: Set<object> | undefined;
  function visit(value: unknown, path: string): JsonValue | undefined {
    if (value === undefined) return undefined;
    const kind = typeof value;
    if (value === null || kind === "string" || kind === "boolean") return value as JsonValue;
    if (kind === "number") {
      if (Number.isFinite(value)) return value as number;
      warn(`Dropped non-serializable prop ${type}.${path}`);
      return undefined;
    }
    // `List.Item.Accessory` carries `Date` labels (also nested in
    // `{ value, color }` forms); clients get the ISO string instead.
    if (value instanceof Date) return value.toISOString();
    // An unimplemented API value (e.g. `Icon.Star` before Icon exists) must fail
    // loudly, not be mistaken for a callback and rendered as a handler.
    const stubPath = unsupportedPath(value);
    if (stubPath) throw new UnsupportedApiError(stubPath);
    if (kind === "function") {
      let name = path;
      while (handlers.has(name)) name += ":handler";
      handlers.set(name, value as Handler);
      return { $handler: name };
    }
    if (kind === "object" && !isValidElement(value)) {
      const obj = value as object;
      const isArr = Array.isArray(obj);
      const proto = isArr ? null : Object.getPrototypeOf(obj);
      if (isArr || proto === Object.prototype || proto === null) {
        if (ancestors?.has(obj)) {
          warn(`Dropped non-serializable prop ${type}.${path}`);
          return undefined;
        }
        ancestors ??= new Set<object>();
        ancestors.add(obj);
        let result: JsonValue;
        if (isArr) {
          const arr = obj as unknown[];
          const out: JsonValue[] = [];
          for (let index = 0; index < arr.length; index++) {
            out.push(visit(arr[index], `${path}[${index}]`) ?? null);
          }
          result = out;
        } else {
          const record = obj as Record<string, unknown>;
          const out: Record<string, JsonValue> = {};
          for (const key in record) {
            if (!Object.hasOwn(record, key)) continue;
            const next = visit(record[key], `${path}.${key}`);
            if (next !== undefined) out[key] = next;
          }
          result = out;
        }
        ancestors.delete(obj);
        return result;
      }
    }
    warn(`Dropped non-serializable prop ${type}.${path}`);
    return undefined;
  }

  const out: Record<string, JsonValue> = {};
  for (const key in props) {
    if (!Object.hasOwn(props, key) || key === "children" || key === "key") continue;
    const value = props[key];
    if (value === undefined) continue;
    const kind = typeof value;
    if (value === null || kind === "string" || kind === "boolean") {
      out[key] = value as JsonValue;
      continue;
    }
    if (kind === "number" && Number.isFinite(value)) {
      out[key] = value as number;
      continue;
    }
    const next = visit(value, key);
    if (next !== undefined) out[key] = next;
  }
  return out;
}
