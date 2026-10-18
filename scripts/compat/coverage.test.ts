import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildReport,
  parseCovers,
  renderCoverageMd,
  type CoverTag,
  type Inventory,
} from "./coverage.ts";
import { checkCoverage, buildCoverage, REPORT_PATH, COVERAGE_PATH } from "./generate-coverage.ts";

const inventory: Inventory = {
  version: "1.2.3",
  entries: [
    { path: "List", kind: "component", deprecated: false },
    { path: "List.Item", kind: "component", deprecated: false },
    { path: "List.Item.Props.title", kind: "property", deprecated: false },
    { path: "Toast.Style", kind: "enum", deprecated: false },
    { path: "Toast.Style.Failure", kind: "enum-member", deprecated: false },
    { path: "old", kind: "function", deprecated: true },
  ],
};

function reportFrom(tags: CoverTag[]) {
  return buildReport(inventory, tags);
}

test("tags parse with location and the ` partial` suffix", () => {
  const tags = parseCovers(
    [
      "// @covers List.Item.Props.title",
      "  //   @covers   List.Item  ",
      "\t// @covers Toast.Style partial",
      "const notATag = '@covers nope';",
      "// @covers-a-prefix List",
    ].join("\n"),
    "packages/x.test.ts",
  );
  expect(tags).toEqual([
    { path: "List.Item.Props.title", partial: false, file: "packages/x.test.ts", line: 1 },
    { path: "List.Item", partial: false, file: "packages/x.test.ts", line: 2 },
    { path: "Toast.Style", partial: true, file: "packages/x.test.ts", line: 3 },
  ]);
});

test("covered, partial and missing statuses; parents are not implied covered", () => {
  const { report, errors } = reportFrom([
    { path: "List.Item.Props.title", partial: false, file: "a.test.ts", line: 1 },
    { path: "Toast.Style", partial: true, file: "a.test.ts", line: 2 },
  ]);
  expect(errors).toEqual([]);
  const status = Object.fromEntries(report.entries.map((entry) => [entry.path, entry.status]));
  expect(status).toEqual({
    List: "missing",
    "List.Item": "missing",
    "List.Item.Props.title": "covered",
    "Toast.Style": "partial",
    "Toast.Style.Failure": "missing",
    old: "missing",
  });
  expect(report.entries.find((entry) => entry.path === "List.Item.Props.title")!.tests).toEqual([
    "a.test.ts",
  ]);
});

test("duplicate tags across files collect every test; a partial tag wins", () => {
  const { report } = reportFrom([
    { path: "List", partial: false, file: "packages/a/list.test.ts", line: 1 },
    { path: "List", partial: false, file: "packages/b/list.test.tsx", line: 5 },
    { path: "List", partial: false, file: "packages/a/list.test.ts", line: 9 },
    { path: "List", partial: true, file: "packages/c/other.test.ts", line: 2 },
  ]);
  const list = report.entries.find((entry) => entry.path === "List")!;
  expect(list.status).toBe("partial");
  expect(list.tests).toEqual([
    "packages/a/list.test.ts",
    "packages/b/list.test.tsx",
    "packages/c/other.test.ts",
  ]);
});

test("unknown tag paths fail with file:line; totals split deprecated from non-deprecated", () => {
  const { errors } = reportFrom([
    { path: "No.Such.Path", partial: false, file: "packages/a/x.test.ts", line: 7 },
    { path: "Also.Missing", partial: true, file: "packages/b/y.test.ts", line: 12 },
  ]);
  expect(errors).toEqual([
    "packages/a/x.test.ts:7: unknown @covers path 'No.Such.Path'",
    "packages/b/y.test.ts:12: unknown @covers path 'Also.Missing'",
  ]);

  const { report } = reportFrom([
    { path: "old", partial: false, file: "a.test.ts", line: 1 },
    { path: "List", partial: false, file: "a.test.ts", line: 2 },
  ]);
  expect(report.totals.nonDeprecated).toEqual({ covered: 1, partial: 0, missing: 4, total: 5 });
  expect(report.totals.deprecated).toEqual({ covered: 1, partial: 0, missing: 0, total: 1 });
  expect(report.totals.all).toEqual({ covered: 2, partial: 0, missing: 4, total: 6 });
});

test("the markdown summary headlines non-deprecated coverage and stays tabular", () => {
  const small: Inventory = {
    version: "9.9.9",
    entries: [
      { path: "List", kind: "component", deprecated: false },
      { path: "List.Item", kind: "component", deprecated: false },
      { path: "old", kind: "function", deprecated: true },
    ],
  };
  const { report } = buildReport(small, [
    { path: "List.Item", partial: true, file: "a.test.ts", line: 1 },
  ]);
  const markdown = renderCoverageMd(report, small);
  expect(markdown).toContain(
    "**Non-deprecated coverage: 0/2 covered (0.0%), 1 partial, 1 missing.**",
  );
  expect(markdown).toContain("Deprecated: 0/1 covered (0.0%), 0 partial, 1 missing.");
  expect(markdown).toContain("| Status | Non-deprecated | Deprecated | All |");
  expect(markdown).toContain("| `List` | component | missing | 0/1/1 |");
  expect(markdown.split("\n").length).toBeLessThan(300);
});

// Fixture roots for the filesystem layer.
function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "blast-coverage-"));
}

function writeFixture(root: string) {
  mkdirSync(join(root, "compat"), { recursive: true });
  writeFileSync(
    join(root, "compat/raycast-api.inventory.json"),
    JSON.stringify({ version: "1.2.3", entries: inventory.entries }),
  );
  mkdirSync(join(root, "packages/alpha"), { recursive: true });
  writeFileSync(
    join(root, "packages/alpha/list.test.ts"),
    "// @covers List\n// @covers List.Item partial\n",
  );
  writeFileSync(join(root, "packages/alpha/other.test.tsx"), "// @covers Toast.Style.Failure\n");
}

test("tags outside packages/ are ignored and the check detects stale artefacts", () => {
  const root = fixtureRoot();
  try {
    writeFixture(root);
    // An unknown path outside packages/ must not fail the check.
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "scripts/not-evidence.test.ts"), "// @covers No.Such.Path\n");

    const built = buildCoverage(root);
    expect(built.errors).toEqual([]);
    const report = JSON.parse(built.json) as {
      version: string;
      entries: Array<{ path: string; status: string; tests: string[] }>;
    };
    expect(report.version).toBe("1.2.3");
    expect(report.entries.find((entry) => entry.path === "List")).toEqual({
      path: "List",
      status: "covered",
      tests: ["packages/alpha/list.test.ts"],
    });
    expect(report.entries.find((entry) => entry.path === "List.Item")!.status).toBe("partial");

    writeFileSync(join(root, REPORT_PATH), built.json);
    writeFileSync(join(root, COVERAGE_PATH), built.markdown);
    expect(checkCoverage(root)).toEqual([]);

    writeFileSync(join(root, REPORT_PATH), `${built.json}\n`);
    writeFileSync(join(root, COVERAGE_PATH), built.markdown);
    expect(checkCoverage(root)).toEqual([
      `${REPORT_PATH}: missing or stale; run \`bun run compat:report\``,
    ]);

    writeFileSync(join(root, REPORT_PATH), built.json);
    writeFileSync(
      join(root, "packages/alpha/list.test.ts"),
      "// @covers List\n// @covers List.Item partial\n// @covers List.Item.Props.title\n",
    );
    expect(checkCoverage(root)).toEqual([
      `${REPORT_PATH}: missing or stale; run \`bun run compat:report\``,
      `${COVERAGE_PATH}: missing or stale; run \`bun run compat:report\``,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown tags fail the check with file:line", () => {
  const root = fixtureRoot();
  try {
    writeFixture(root);
    writeFileSync(join(root, "packages/alpha/bad.test.ts"), "// @covers List.Item.Props.Titel\n");
    expect(checkCoverage(root)).toEqual([
      "packages/alpha/bad.test.ts:1: unknown @covers path 'List.Item.Props.Titel'",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("saved usage weights rank missing paths, break ties by path and participate in staleness checks", () => {
  const root = fixtureRoot();
  try {
    writeFixture(root);
    const path = join(root, "compat/raycast-usage.json");
    const usage = {
      corpusCommit: "pin",
      extensions: 20,
      paths: { "Toast.Style": 10, old: 10, List: 20 },
    };
    writeFileSync(path, JSON.stringify(usage));
    const built = buildCoverage(root);
    const entries = JSON.parse(built.json).entries as Array<{ path: string; weight: number }>;
    expect(entries.find((entry) => entry.path === "List")!.weight).toBe(20);
    expect(entries.find((entry) => entry.path === "List.Item")!.weight).toBe(0);
    expect(built.markdown).toContain("## Top missing by usage");
    expect(built.markdown).toContain("| `Toast.Style` | 10 |\n| `old` | 10 |");
    expect(built.markdown).not.toContain("| `List.Item.Props.title` | 0 |");
    writeFileSync(join(root, REPORT_PATH), built.json);
    writeFileSync(join(root, COVERAGE_PATH), built.markdown);
    expect(checkCoverage(root)).toEqual([]);
    usage.paths["Toast.Style"] = 11;
    writeFileSync(path, JSON.stringify(usage));
    expect(checkCoverage(root)).toHaveLength(2);
    usage.paths["Toast.Style"] = 21;
    writeFileSync(path, JSON.stringify(usage));
    expect(checkCoverage(root)).toEqual(["compat/raycast-usage.json: invalid usage file"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("top missing by usage is limited to 50 and excludes covered or partial paths", () => {
  const many: Inventory = {
    version: "test",
    entries: Array.from({ length: 60 }, (_, i) => ({
      path: `path${i.toString().padStart(2, "0")}`,
      kind: "function",
      deprecated: false,
    })),
  };
  const { report } = buildReport(
    many,
    [
      { path: "path00", partial: false, file: "test", line: 1 },
      { path: "path01", partial: true, file: "test", line: 2 },
    ],
    Object.fromEntries(many.entries.map((entry, i) => [entry.path, 60 - i])),
  );
  const table = renderCoverageMd(report, many).split("## Top missing by usage")[1]!;
  expect(table).not.toContain("path00");
  expect(table).not.toContain("path01");
  expect(table).toContain("path51");
  expect(table).not.toContain("path52");
  expect(table.split("\n").filter((line) => line.startsWith("| `"))).toHaveLength(50);
});

test("committed report and summary match regeneration from the pinned inventory", () => {
  const built = buildCoverage(process.cwd());
  expect(built.errors).toEqual([]);
  expect(built.json).toBe(readFileSync(REPORT_PATH, "utf8"));
  expect(built.markdown).toBe(readFileSync(COVERAGE_PATH, "utf8"));
  const report = JSON.parse(built.json) as {
    version: string;
    totals: { all: { covered: number; partial: number; missing: number } };
  };
  // Every inventory entry is accounted for exactly once, whatever the version.
  const pinned = JSON.parse(readFileSync("compat/raycast-api.inventory.json", "utf8")) as {
    version: string;
    entries: unknown[];
  };
  expect(report.version).toBe(pinned.version);
  const { covered, partial, missing } = report.totals.all;
  expect(covered + partial + missing).toBe(pinned.entries.length);
});
