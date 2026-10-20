import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAPABILITIES,
  isCapabilityName,
  type CapabilitySchema,
  type CapabilitySchemaType,
} from "./capabilities.ts";

const SCHEMA_KEYS = new Set(["type", "properties", "required", "items", "enum"]);
const SCHEMA_TYPES = new Set<CapabilitySchemaType>([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

const inventory = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../compat/raycast-api.json"), "utf8"),
) as { entries: Array<{ path: string }> };
const raycastPaths = new Set(inventory.entries.map((entry) => entry.path));

function schemaErrors(schema: CapabilitySchema, at: string): string[] {
  const errors: string[] = [];
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return [`${at}: must be an object`];
  }
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYS.has(key)) errors.push(`${at}: unknown key "${key}"`);
  }

  const declared = schema.type;
  let types: readonly string[] = [];
  if (declared !== undefined) {
    types = Array.isArray(declared) ? declared : [declared];
    if (types.length === 0) errors.push(`${at}.type: must not be empty`);
    for (const type of types) {
      if (!SCHEMA_TYPES.has(type as CapabilitySchemaType))
        errors.push(`${at}.type: unknown type "${type}"`);
    }
    if (new Set(types).size !== types.length) errors.push(`${at}.type: duplicate type`);
  }

  const properties = schema.properties;
  if (properties !== undefined) {
    if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
      errors.push(`${at}.properties: must be an object`);
    } else {
      if (types.length > 0 && !types.includes("object"))
        errors.push(`${at}: properties require an object type`);
      for (const [key, value] of Object.entries(properties)) {
        errors.push(...schemaErrors(value, `${at}.properties.${key}`));
      }
    }
  }

  const required = schema.required;
  if (required !== undefined) {
    if (!Array.isArray(required)) {
      errors.push(`${at}.required: must be an array`);
    } else {
      if (new Set(required).size !== required.length) errors.push(`${at}.required: duplicate name`);
      for (const name of required) {
        if (typeof name !== "string") errors.push(`${at}.required: names must be strings`);
        if (properties && !Object.hasOwn(properties, name))
          errors.push(`${at}.required: unknown property "${name}"`);
      }
    }
  }

  const items = schema.items;
  if (items !== undefined) {
    if (types.length > 0 && !types.includes("array"))
      errors.push(`${at}: items require an array type`);
    errors.push(...schemaErrors(items, `${at}.items`));
  }

  const values = schema.enum;
  if (values !== undefined) {
    if (!Array.isArray(values) || values.length === 0) {
      errors.push(`${at}.enum: must be a non-empty array`);
    } else {
      for (const value of values) {
        if (
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        )
          errors.push(`${at}.enum: values must be primitive`);
      }
      if (new Set(values.map((value) => JSON.stringify(value))).size !== values.length)
        errors.push(`${at}.enum: duplicate value`);
    }
  }

  return errors;
}

test("every api path exists in the Raycast inventory", () => {
  const unknown: string[] = [];
  for (const [name, capability] of Object.entries(CAPABILITIES)) {
    expect(capability.api.length, name).toBeGreaterThan(0);
    for (const path of capability.api) {
      if (!raycastPaths.has(path)) unknown.push(`${name}: ${path}`);
    }
  }
  expect(unknown).toEqual([]);
});

test("every capability has a scope, a summary and well-formed schemas", () => {
  const errors: string[] = [];
  const entries = Object.entries(CAPABILITIES);
  expect(entries.length).toBeGreaterThan(0);
  for (const [name, capability] of entries) {
    if (capability.scope !== "session" && capability.scope !== "grant")
      errors.push(`${name}: scope must be "session" or "grant"`);
    if (typeof capability.summary !== "string" || capability.summary.trim() === "")
      errors.push(`${name}: missing summary`);
    if (!("type" in capability.params)) errors.push(`${name}.params: missing type`);
    if (!("type" in capability.result)) errors.push(`${name}.result: missing type`);
    errors.push(...schemaErrors(capability.params, `${name}.params`));
    errors.push(...schemaErrors(capability.result, `${name}.result`));
  }
  expect(errors).toEqual([]);
});

test("isCapabilityName recognizes catalog names only", () => {
  for (const name of Object.keys(CAPABILITIES)) expect(isCapabilityName(name)).toBe(true);
  expect(isCapabilityName("clipboard.nope")).toBe(false);
  expect(isCapabilityName("toString")).toBe(false);
});
