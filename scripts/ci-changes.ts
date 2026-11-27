// Classifies changed files in CI so example jobs only run when their inputs
// change. Fail-safe: when the changed-file list cannot be determined reliably
// (initial commit, force push, truncated API response, workflow_dispatch, or
// shared toolchain/workflow edits), every target runs.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export type CiTargets = {
  macos: boolean;
  go: boolean;
  python: boolean;
  tmux: boolean;
};

const ALL_TRUE: CiTargets = { macos: true, go: true, python: true, tmux: true };

const SHARED_FILES = new Set([
  ".github/workflows/ci.yml",
  ".nvmrc",
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "scripts/ci-changes.ts",
]);

const SERVE_PREFIXES = [
  "packages/serve/",
  "packages/host/",
  "packages/runtime/",
  "packages/protocol/",
  "packages/client-core/",
  "packages/native/",
  "packages/shared-deps/",
];

const EMBEDDER_FIXTURE_PREFIXES = ["fixtures/extensions/", "fixtures/protocol/"];

const hasPrefix = (path: string, prefixes: readonly string[]) =>
  prefixes.some((prefix) => path.startsWith(prefix));

export function classifyChanges(files: readonly string[] | null): CiTargets {
  if (files === null) return { ...ALL_TRUE };
  const result: CiTargets = { macos: false, go: false, python: false, tmux: false };
  for (const file of files) {
    if (SHARED_FILES.has(file)) return { ...ALL_TRUE };
    const inServe = hasPrefix(file, SERVE_PREFIXES);
    const inFixtures = hasPrefix(file, EMBEDDER_FIXTURE_PREFIXES);
    if (
      inServe ||
      inFixtures ||
      file.startsWith("examples/macos-launcher/") ||
      file === "scripts/mac-fixtures.ts"
    )
      result.macos = true;
    if (inServe || inFixtures || file.startsWith("examples/go-embedder/")) result.go = true;
    if (
      inServe ||
      inFixtures ||
      file.startsWith("examples/python-embedder/") ||
      file === "scripts/example-python.ts"
    )
      result.python = true;
    if (
      inServe ||
      file.startsWith("packages/tui/") ||
      file.startsWith("packages/cli/") ||
      file.startsWith("examples/tmux-plugin/") ||
      file === "scripts/tmux-plugin-e2e.ts" ||
      file === "scripts/tmux-harness.ts"
    )
      result.tmux = true;
  }
  return result;
}

const ZERO_SHA = /^0+$/;

/** Fetches the changed file paths via `gh api`, or returns `null` to fail-safe. */
export function fetchChangedFiles(env: NodeJS.ProcessEnv): string[] | null {
  const event = env.GITHUB_EVENT_NAME;
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) return null;

  if (event === "pull_request") {
    const pr = env.PR_NUMBER;
    if (!pr || !/^\d+$/.test(pr)) return null;
    const result = spawnSync(
      "gh",
      ["api", "--paginate", `repos/${repo}/pulls/${pr}/files?per_page=100`, "--jq", ".[].filename"],
      { encoding: "utf8" },
    );
    if (result.status !== 0) return null;
    const files = result.stdout.split("\n").filter(Boolean);
    // GitHub's PR files endpoint caps at 3,000 files; fail-safe if truncated.
    return files.length >= 3000 ? null : files;
  }

  if (event === "push") {
    const before = env.BEFORE_SHA ?? "";
    const after = env.AFTER_SHA ?? "";
    if (!before || !after || ZERO_SHA.test(before)) return null;
    const result = spawnSync(
      "gh",
      ["api", `repos/${repo}/compare/${before}...${after}`, "--jq", ".files[].filename"],
      { encoding: "utf8" },
    );
    if (result.status !== 0) return null;
    const files = result.stdout.split("\n").filter(Boolean);
    // GitHub's compare endpoint returns at most 300 files; fail-safe if truncated.
    return files.length >= 300 ? null : files;
  }

  return null;
}

if (import.meta.main) {
  const files = fetchChangedFiles(process.env);
  const targets = classifyChanges(files);
  const lines = Object.entries(targets)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  console.log(
    `ci-changes (${files === null ? "fallback: all" : `${files.length} files`}): ${Object.entries(
      targets,
    )
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
  );
}
