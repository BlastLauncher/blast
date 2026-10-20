import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "oxfmt";
import { parseSync, type Statement } from "oxc-parser";
import { VENDOR_TYPES } from "./check-vendor.ts";

export const ENUMS_PATH = "packages/runtime/src/api/enums.generated.ts";
export const ENUM_TEST_PATH = "packages/runtime/src/api/enums.generated.test.ts";

/**
 * Every enum in the declarations is generated, top-level or in a namespace and
 * whether or not it is exported there: aliases like `Toast.Style` are declared
 * as unexported enums (`ToastStyle_2`) that the runtime imports by declaration
 * name. These are the paths that are public `@raycast/api` values; they
 * additionally get `@covers` evidence in the generated test and are checked
 * against the runtime's public surface, where the stub layer must serve their
 * real values.
 */
const PUBLIC_ENUMS = [
  "AI.Model",
  "Color",
  "Icon",
  "Image.Mask",
  "LaunchType",
  "PopToRootType",
] as const;
/** These two must exist in every `@raycast/api` release Blast vendors. */
const REQUIRED_ENUMS = ["Icon", "Color"] as const;
/**
 * Public members the runtime adds around a declared enum. `Color.Brown` is a
 * deprecated dynamic pair, not an enum member, so the declarations carry no
 * value for it and the generated const cannot supply it.
 */
const PUBLIC_ENUM_EXTRA_MEMBERS: Record<string, readonly string[]> = { Color: ["Brown"] };

function members(node: Extract<Statement, { type: "TSEnumDeclaration" }>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const member of node.body.members) {
    if (
      (member.id.type !== "Identifier" && member.id.type !== "Literal") ||
      member.initializer?.type !== "Literal" ||
      typeof member.initializer.value !== "string"
    )
      throw new Error(`Expected string enum member in ${node.id.name}`);
    values[member.id.type === "Identifier" ? member.id.name : String(member.id.value)] =
      member.initializer.value;
  }
  return values;
}

/** Every string enum in the declarations, keyed by its declaration path. */
export function enumValues(source: string): Record<string, Record<string, string>> {
  const parsed = parseSync("index.d.ts", source);
  if (parsed.errors.length) throw new Error("Invalid enum declarations");
  const result: Record<string, Record<string, string>> = {};
  const collect = (statements: Statement[], scope: string) => {
    for (const statement of statements) {
      const node = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
      if (node?.type === "TSModuleDeclaration" && node.id.type === "Identifier") {
        if (node.body?.type === "TSModuleBlock")
          collect(node.body.body, scope === "" ? node.id.name : `${scope}.${node.id.name}`);
        continue;
      }
      if (node?.type !== "TSEnumDeclaration") continue;
      const path = scope === "" ? node.id.name : `${scope}.${node.id.name}`;
      result[path] = members(node);
    }
  };
  collect(parsed.program.body, "");
  for (const name of REQUIRED_ENUMS) if (!result[name]) throw new Error("Missing Icon or Color");
  return result;
}

/** A JS object literal; short enough that the formatter lays it out. */
type Literal = string | { [key: string]: Literal };
function literal(value: Literal): string {
  if (typeof value === "string") return JSON.stringify(value);
  return `{ ${Object.entries(value)
    .map(([key, item]) => `${JSON.stringify(key)}: ${literal(item)}`)
    .join(", ")} }`;
}

/** Groups `Image.Mask` under its `Image` namespace so the const nests. */
function constants(enums: Record<string, Record<string, string>>): Record<string, Literal> {
  const code: Record<string, Literal> = {};
  for (const [path, values] of Object.entries(enums)) {
    const [head, ...rest] = path.split(".");
    code[head!] =
      rest.length === 0
        ? values
        : { ...(code[head!] as Record<string, Literal>), [rest.join(".")]: values };
  }
  return code;
}

function generatedTestCode(enums: Record<string, Record<string, string>>): string {
  const paths = Object.keys(enums).toSorted();
  const publicPaths = PUBLIC_ENUMS.filter((path) => enums[path] !== undefined);
  return [
    'import { expect, test } from "bun:test";',
    'import { readFileSync } from "node:fs";',
    'import { enumValues } from "../../../../scripts/compat/generate-enums.ts";',
    'import * as generated from "./enums.generated.ts";',
    'import * as api from "./index.ts";',
    "",
    "const at = (object: unknown, path: string) =>",
    '  path.split(".").reduce((node, key) => (node as Record<string, unknown>)[key], object);',
    "",
    ...publicPaths.flatMap((path) => [
      `// @covers ${path}`,
      ...Object.keys(enums[path]!).map((key) => `// @covers ${path}.${key}`),
    ]),
    'test("every declared enum is generated with its declared members", () => {',
    '  const expected = enumValues(readFileSync(new URL("../../../../compat/raycast-api/index.d.ts", import.meta.url), "utf8"));',
    `  const paths = ${JSON.stringify(paths)};`,
    "  expect(Object.keys(expected).toSorted()).toEqual(paths);",
    "  for (const [path, declared] of Object.entries(expected)) {",
    "    const members = at(generated, path) as Record<string, string>;",
    "    expect(members as unknown).toEqual(declared);",
    "    for (const [key, value] of Object.entries(declared)) expect(members[key]).toBe(value);",
    "  }",
    "});",
    'test("the public API surface serves the generated enum values", () => {',
    `  const paths = ${JSON.stringify(publicPaths)};`,
    `  const extraMembers = ${JSON.stringify(PUBLIC_ENUM_EXTRA_MEMBERS)};`,
    "  for (const path of paths) {",
    "    const expected = at(generated, path) as Record<string, string>;",
    "    const actual = at(api, path) as Record<string, unknown>;",
    "    for (const [key, value] of Object.entries(expected)) expect(actual[key]).toBe(value);",
    "    // Only the documented deprecated extras may sit beside the enum members.",
    "    const extra = Object.keys(actual).filter((key) => !Object.hasOwn(expected, key));",
    "    expect(extra).toEqual((extraMembers as Record<string, string[] | undefined>)[path] ?? []);",
    "  }",
    "});",
    "",
  ].join("\n");
}

export async function generateEnums(root: string): Promise<Record<string, string>> {
  const enums = enumValues(readFileSync(join(root, VENDOR_TYPES), "utf8"));
  const header = "// Generated by scripts/compat/generate-enums.ts; do not edit.\n";
  const outputs = {
    [ENUMS_PATH]:
      header +
      Object.entries(constants(enums))
        .map(([name, values]) => `export const ${name} = ${literal(values)} as const;\n`)
        .join(""),
    [ENUM_TEST_PATH]: header + generatedTestCode(enums),
  };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(outputs).map(async ([file, code]) => {
        const result = await format(file, code, { printWidth: 100 });
        if (result.errors.length) throw new Error(`Cannot format ${file}`);
        return [file, result.code];
      }),
    ),
  );
}

export async function checkEnums(root: string): Promise<string[]> {
  return Object.entries(await generateEnums(root)).flatMap(([file, expected]) => {
    const path = join(root, file);
    return existsSync(path) && readFileSync(path, "utf8") === expected
      ? []
      : [`${file}: missing or stale; run bun run compat:enums`];
  });
}

if (import.meta.main) {
  for (const [file, output] of Object.entries(await generateEnums(process.cwd())))
    writeFileSync(file, output);
}
