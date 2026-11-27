import { describe, expect, test } from "bun:test";
import { classifyChanges } from "./ci-changes.ts";

describe("ci-changes", () => {
  test("fails safe to all targets when the diff is unavailable or shared config changes", () => {
    const all = { macos: true, go: true, python: true, tmux: true };
    expect(classifyChanges(null)).toEqual(all);
    for (const shared of [
      ".github/workflows/ci.yml",
      ".nvmrc",
      "package.json",
      "bun.lock",
      "tsconfig.json",
      "scripts/ci-changes.ts",
    ]) {
      expect(classifyChanges([shared])).toEqual(all);
    }
  });

  test("skips all example jobs for docs, web, browser-demo and task edits", () => {
    expect(
      classifyChanges([
        "docs/performance.md",
        "README.md",
        "PLAN.md",
        "packages/web/src/index.ts",
        "packages/cors-proxy/src/index.ts",
        "examples/browser-demo/main.ts",
        "tasks/0198-faster-ci-and-release.md",
        "compat/COVERAGE.md",
      ]),
    ).toEqual({ macos: false, go: false, python: false, tmux: false });
  });

  test("triggers only the owning example job for example-local edits", () => {
    expect(classifyChanges(["examples/macos-launcher/Sources/BlastKit/View.swift"])).toEqual({
      macos: true,
      go: false,
      python: false,
      tmux: false,
    });
    expect(classifyChanges(["scripts/mac-fixtures.ts"])).toEqual({
      macos: true,
      go: false,
      python: false,
      tmux: false,
    });
    expect(classifyChanges(["examples/go-embedder/main.go"])).toEqual({
      macos: false,
      go: true,
      python: false,
      tmux: false,
    });
    expect(classifyChanges(["examples/python-embedder/embedder.py"])).toEqual({
      macos: false,
      go: false,
      python: true,
      tmux: false,
    });
    expect(classifyChanges(["examples/tmux-plugin/scripts/palette.sh"])).toEqual({
      macos: false,
      go: false,
      python: false,
      tmux: true,
    });
    expect(classifyChanges(["packages/tui/src/app.tsx"])).toEqual({
      macos: false,
      go: false,
      python: false,
      tmux: true,
    });
  });

  test("triggers embedder jobs on serve/protocol/host/fixture edits and tmux on serve deps", () => {
    expect(classifyChanges(["packages/serve/src/main.ts"])).toEqual({
      macos: true,
      go: true,
      python: true,
      tmux: true,
    });
    expect(classifyChanges(["fixtures/protocol/view-patches.json"])).toEqual({
      macos: true,
      go: true,
      python: true,
      tmux: false,
    });
  });
});
