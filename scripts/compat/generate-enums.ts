import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "oxfmt";
import { parseSync, type Statement } from "oxc-parser";
import { VENDOR_TYPES } from "./check-vendor.ts";

export const ENUMS_PATH = "packages/runtime/src/api/enums.generated.ts";
export const ENUM_TEST_PATH = "packages/runtime/src/api/enums.generated.test.ts";

/**
 * The value enums the runtime implements, by public API path. All of them come
 * from the declarations; `Image.Mask` is the one that lives in a namespace, so
 * the generated `Image` const nests it. A path the declarations drop simply
 * disappears from the generated file, and `compat:check` reports the staleness.
 */
const GENERATED_ENUMS = ["Color", "Icon", "Image.Mask", "LaunchType", "PopToRootType"] as const;
/** These two must exist in every `@raycast/api` release Blast vendors. */
const REQUIRED_ENUMS = ["Icon", "Color"] as const;

function members(node: Extract<Statement, { type: "TSEnumDeclaration" }>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const member of node.body.members) {
    if (
      member.id.type !== "Identifier" ||
      member.initializer?.type !== "Literal" ||
      typeof member.initializer.value !== "string"
    )
      throw new Error(`Expected string enum member in ${node.id.name}`);
    values[member.id.name] = member.initializer.value;
  }
  return values;
}

/** Every string enum in the declarations the runtime implements, by public path. */
export function enumValues(
  source: string,
  paths: readonly string[] = GENERATED_ENUMS,
): Record<string, Record<string, string>> {
  const parsed = parseSync("index.d.ts", source);
  if (parsed.errors.length) throw new Error("Invalid enum declarations");
  const required = new Set<string>(paths);
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
      if (required.has(path)) result[path] = members(node);
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
  const paths = Object.keys(enums);
  const imports = [...new Set(paths.map((path) => path.split(".")[0]!))].toSorted();
  return [
    'import { expect, test } from "bun:test";',
    'import { readFileSync } from "node:fs";',
    'import { enumValues } from "../../../../scripts/compat/generate-enums.ts";',
    `import { ${imports.join(", ")} } from "./index.ts";`,
    "",
    ...paths.flatMap((path) => [
      `// @covers ${path}`,
      ...Object.keys(enums[path]!).map((key) => `// @covers ${path}.${key}`),
    ]),
    'test("every generated enum member matches its declaration", () => {',
    '  const expected = enumValues(readFileSync(new URL("../../../../compat/raycast-api/index.d.ts", import.meta.url), "utf8"));',
    `  const generated: Record<string, unknown> = { ${paths
      .map((path) => (path.includes(".") ? `${JSON.stringify(path)}: ${path}` : path))
      .join(", ")} };`,
    `  expect(Object.keys(generated).toSorted()).toEqual(${JSON.stringify([...paths].toSorted())});`,
    "  for (const [path, declared] of Object.entries(expected)) {",
    "    const members = generated[path] as Record<string, string>;",
    "    expect(members as unknown).toEqual(declared);",
    "    for (const [key, value] of Object.entries(declared)) expect(members[key]).toBe(value);",
    "  }",
    "});",
    "",
  ].join("\n");
}

export async function generateEnums(root: string): Promise<Record<string, string>> {
  const declared = enumValues(readFileSync(join(root, VENDOR_TYPES), "utf8"));
  const enums = Object.fromEntries(
    GENERATED_ENUMS.filter((path) => declared[path] !== undefined).map((path) => [
      path,
      declared[path]!,
    ]),
  );
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
