import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { aggregateUsage, scanExtension } from "./usage.ts";
import { sourcePatterns } from "./scan.ts";
import { buildPatterns } from "./corpus.ts";

const known = new Set([
  "List",
  "List.Item",
  "List.Item.Props.title",
  "List.Item.Props.actions",
  "List.Props.isLoading",
  "Action",
  "Action.CopyToClipboard",
  "Action.CopyToClipboard.Props.content",
  "Toast",
  "Toast.Style",
  "Toast.Style.Success",
  "Clipboard",
  "Clipboard.copy",
  "showToast",
]);

function scan(source: string, file = "fixture.tsx") {
  return scanExtension([{ file, source }], known);
}

test("named and aliased imports, member chains, JSX elements and attributes resolve to inventory paths", () => {
  const result = scan(`
    import { List as L, Action, Toast as T, Clipboard, showToast, Unknown } from "@raycast/api";
    import { useFetch } from "@raycast/utils";
    showToast({ style: T.Style.Success }); Clipboard.copy("hello");
    const view = <L isLoading><L.Item title="x" actions={<Action.CopyToClipboard content="x"/>} unknown="x" /></L>;
  `);
  expect(result).toEqual({ paths: [...known].toSorted(), utils: true, failures: [] });
});

test("namespace imports resolve chains, JSX and type names without inventing a namespace path", () => {
  const result = scan(`
    import * as R from "@raycast/api";
    type S = R.Toast.Style;
    R.Clipboard["copy"]("x"); R.Clipboard[dynamic]("x");
    const view = <R.List.Item title="x" {...props} />;
  `);
  expect(result.paths).toEqual(
    [
      "Clipboard",
      "Clipboard.copy",
      "List",
      "List.Item",
      "List.Item.Props.title",
      "Toast",
      "Toast.Style",
    ].toSorted(),
  );
});

test("imports are local to each file; unrelated names, comments, strings and unknown paths are ignored", () => {
  const result = scanExtension(
    [
      {
        file: "a.ts",
        source: 'import { List } from "other"; List.Item; "Clipboard.copy"; // Toast.Style.Success',
      },
      {
        file: "b.tsx",
        source: 'import { List as L } from "@raycast/api"; L.DoesNotExist; <Other title="x" />;',
      },
      { file: "c.tsx", source: '<L.Item title="x" />;' },
    ],
    known,
  );
  expect(result.paths).toEqual(["List"]);
});

test("each extension counts once per path across repeated uses and files; aggregation is sorted and includes zeros", () => {
  const first = scanExtension(
    [
      {
        file: "a.tsx",
        source:
          'import { List } from "@raycast/api"; <List.Item title="a"/>; <List.Item title="b"/>;',
      },
      { file: "b.tsx", source: 'import { List } from "@raycast/api"; <List.Item title="a"/>;' },
    ],
    known,
  );
  const second = scan('import { List } from "@raycast/api";');
  const usage = aggregateUsage("pin", known, [first, second]);
  expect(usage.extensions).toBe(2);
  expect(usage.paths.List).toBe(2);
  expect(usage.paths["List.Item"]).toBe(1);
  expect(usage.paths["List.Item.Props.title"]).toBe(1);
  expect(usage.paths.showToast).toBe(0);
  expect(Object.keys(usage.paths)).toEqual([...known].toSorted());
  expect(JSON.stringify(usage)).toBe(JSON.stringify(aggregateUsage("pin", known, [second, first])));
});

test("syntax errors are reported per file without discarding other files", () => {
  const result = scanExtension(
    [
      { file: "bad.ts", source: "const =" },
      { file: "good.js", source: 'import { showToast } from "@raycast/api";' },
    ],
    known,
  );
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toStartWith("bad.ts:");
  expect(result.paths).toEqual(["showToast"]);
});

test("non-cone source patterns match root and nested code only, and resetting removes sources", () => {
  const root = mkdtempSync(join(tmpdir(), "blast-sparse-"));
  const files = [
    "package.json",
    "src/main.ts",
    "src/nested/view.tsx",
    "src/a.js",
    "src/b.jsx",
    "src/image.png",
    "assets/icon.png",
  ];
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  };
  try {
    for (const file of files) {
      const path = join(root, "extensions/example", file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "fixture");
    }
    git("init", "--quiet");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    );
    git("sparse-checkout", "set", "--no-cone", ...sourcePatterns(["example"]));
    for (const file of files)
      expect(existsSync(join(root, "extensions/example", file))).toBe(!file.endsWith(".png"));
    git("sparse-checkout", "set", "--no-cone", ...buildPatterns());
    expect(existsSync(join(root, "extensions/example/package.json"))).toBe(true);
    expect(existsSync(join(root, "extensions/example/src"))).toBe(false);
    expect(() => sourcePatterns(["../escape"])).toThrow("invalid extension name");
    expect(sourcePatterns(["CodeBlocks", "http.cat", "transfer-sh_upload"])).toHaveLength(13);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
