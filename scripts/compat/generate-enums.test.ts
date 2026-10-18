import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEnums, enumValues, generateEnums } from "./generate-enums.ts";

test("enum extraction preserves declared strings and rejects unsupported declarations", () => {
  expect(
    enumValues(
      'export declare enum Icon { Test = "exact-16" } export declare enum Color { Red = "raycast-red" }',
    ),
  ).toEqual({ Icon: { Test: "exact-16" }, Color: { Red: "raycast-red" } });
  expect(() =>
    enumValues("export declare enum Icon { Test = 1 } export declare enum Color {}"),
  ).toThrow("Expected string enum member");
  expect(() => enumValues("export declare enum Icon {}")).toThrow("Missing Icon or Color");
  expect(() => enumValues("export declare enum Icon {")).toThrow("Invalid enum declarations");
});

test("enum extraction emits every declared enum, including namespaced and non-exported ones", () => {
  const source = [
    'export declare enum Icon { Test = "exact-16" }',
    'export declare enum Color { Red = "raycast-red" }',
    'export declare namespace Image { export enum Mask { Circle = "circle", RoundedRectangle = "roundedRectangle" } }',
    'export declare namespace AI { export enum Model { "OpenAI_GPT-5.4" = "openai-gpt-5.4" } }',
    'declare enum ActionStyle { Regular = "regular", Destructive = "destructive" }',
  ].join("\n");
  // Non-exported enums (alias backs like `ActionStyle`) are emitted too, keyed
  // by declaration name; string-literal member ids keep their names.
  expect(enumValues(source)).toEqual({
    Icon: { Test: "exact-16" },
    Color: { Red: "raycast-red" },
    "Image.Mask": { Circle: "circle", RoundedRectangle: "roundedRectangle" },
    "AI.Model": { "OpenAI_GPT-5.4": "openai-gpt-5.4" },
    ActionStyle: { Regular: "regular", Destructive: "destructive" },
  });
  expect(() =>
    enumValues('export declare enum Icon { Test = "x" } declare enum Model { Numeric = 1 }'),
  ).toThrow("Expected string enum member in Model");
});

test("enum generation is stable and checks both values and evidence for staleness", async () => {
  const root = mkdtempSync(join(tmpdir(), "blast-enums-"));
  try {
    mkdirSync(join(root, "compat/raycast-api"), { recursive: true });
    mkdirSync(join(root, "packages/runtime/src/api"), { recursive: true });
    writeFileSync(
      join(root, "compat/raycast-api/index.d.ts"),
      'export declare enum Icon { Test = "exact-16" } export declare enum Color { Red = "raycast-red" }',
    );
    const outputs = await generateEnums(root);
    expect(await generateEnums(root)).toEqual(outputs);
    expect(await checkEnums(root)).toHaveLength(2);
    for (const [file, output] of Object.entries(outputs)) writeFileSync(join(root, file), output);
    expect(await checkEnums(root)).toEqual([]);
    for (const [file, output] of Object.entries(outputs)) {
      writeFileSync(join(root, file), output + "// changed\n");
      expect(await checkEnums(root)).toHaveLength(1);
      writeFileSync(join(root, file), output);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed enum values and coverage evidence match regeneration", async () => {
  expect(await checkEnums(process.cwd())).toEqual([]);
  const outputs = await generateEnums(process.cwd());
  for (const [file, output] of Object.entries(outputs))
    expect(readFileSync(file, "utf8")).toBe(output);
});
