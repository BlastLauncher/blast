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
  const ancestors = new Set<object>();
  function visit(value: unknown, path: string): JsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // An unimplemented API value (e.g. `Icon.Star` before Icon exists) must fail
    // loudly, not be mistaken for a callback and rendered as a handler.
    const stubPath = unsupportedPath(value);
    if (stubPath) throw new UnsupportedApiError(stubPath);
    if (typeof value === "function") {
      let name = path;
      while (handlers.has(name)) name += ":handler";
      handlers.set(name, value as Handler);
      return { $handler: name };
    }
    if (
      typeof value === "object" &&
      !isValidElement(value) &&
      (Array.isArray(value) ||
        Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null) &&
      !ancestors.has(value)
    ) {
      ancestors.add(value);
      const result = Array.isArray(value)
        ? Array.from(value, (item, index) => visit(item, `${path}[${index}]`) ?? null)
        : Object.fromEntries(
            Object.entries(value).flatMap(([key, item]) => {
              const next = visit(item, `${path}.${key}`);
              return next === undefined ? [] : [[key, next]];
            }),
          );
      ancestors.delete(value);
      return result;
    }
    warn(`Dropped non-serializable prop ${type}.${path}`);
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(props).flatMap(([key, value]) => {
      if (key === "children" || key === "key") return [];
      const next = visit(value, key);
      return next === undefined ? [] : [[key, next]];
    }),
  );
}
