import { describe, expect, test } from "bun:test";
import { catalogCommands, isBrowserCatalogBlocked } from "./browser-catalog.ts";
import { exclusions, markdown, type Report } from "../examples/browser-demo/sweep-report.ts";

test("browser catalog filter excludes native and process dependencies generically", () => {
  expect(isBrowserCatalogBlocked(["run-applescript"])).toBe(true);
  expect(isBrowserCatalogBlocked(["some-native-addon"])).toBe(true);
  expect(isBrowserCatalogBlocked(["react", "date-fns"])).toBe(false);
});

const result = (extension: string, command: string, outcome: string, limit?: string) => ({
  extension,
  command,
  title: command,
  outcome,
  ...(limit ? { limit } : {}),
  pageErrors: [],
  consoleErrors: [],
  elapsedMs: 1,
});
const report = (overrides: Partial<Report> = {}): Report => ({
  schema: 2,
  commit: "abc",
  date: "2026-11-14",
  commands: 3,
  wallTimeMs: 1000,
  totals: { "browser-limit": 1, rendered: 1, "rendered-with-placeholders": 1 },
  limits: { "applications.list": 1 },
  excluded: [],
  results: [
    result("app-a", "toggle", "browser-limit", "applications.list"),
    result("app-a", "list", "rendered"),
    result("plain", "index", "rendered-with-placeholders"),
  ],
  ...overrides,
});

describe("browser-limit exclusions", () => {
  test("drop every command the last sweep found browser-limit, keeping its siblings", () => {
    const smoke = [
      { extension: "app-a", command: "toggle", mode: "no-view", outcome: "rendered" },
      { extension: "app-a", command: "list", mode: "view", outcome: "rendered" },
      { extension: "plain", command: "index", mode: "view", outcome: "rendered" },
    ];
    const commands = catalogCommands(smoke, [], exclusions(report()));
    expect([...commands.get("app-a")!]).toEqual(["list"]);
    expect([...commands.get("plain")!]).toEqual(["index"]);
  });
  test("keep earlier exclusions the sweep no longer runs", () => {
    const earlier = { extension: "gone", command: "index", limit: "selection.text" };
    expect(exclusions(report({ excluded: [earlier] }))).toEqual([
      { extension: "app-a", command: "toggle", limit: "applications.list" },
      earlier,
    ]);
  });
  test("the report lists exclusions with their capability and both rendered counts", () => {
    const text = markdown(report({ excluded: exclusions(report()) }));
    expect(text).toContain("## Excluded from the demo");
    expect(text).toContain("| `app-a/toggle` | applications.list |");
    expect(text).toContain(
      "Rendered: **2 / 2** (1 rendered + 1 rendered with placeholder preferences) of 3 commands − 1 browser-limit.",
    );
  });
  test("needs-credentials stays out of the Blast failures table", () => {
    const text = markdown(
      report({
        results: [
          {
            ...result("svc", "list", "needs-credentials"),
            credentials: "HTTP 401 api.example.com",
          },
          result("broken", "index", "runtime-error:Boom"),
        ],
      }),
    );
    const failures = text.slice(
      text.indexOf("## Blast failures"),
      text.indexOf("## Needs credentials"),
    );
    expect(failures).toContain("runtime-error:Boom");
    expect(failures).not.toContain("svc/list");
    expect(text).toContain("| HTTP 401 api.example.com | 1 | `svc/list` |");
    expect(text).toContain("Not rendered: 1 Blast failure(s), 1 needing real credentials.");
  });
});
