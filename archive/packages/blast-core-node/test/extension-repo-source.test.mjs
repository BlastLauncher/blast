import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ExtensionRepoSourceError, fetchExtensionsFromRepo } from "../dist/index.js";

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe", env: { ...process.env } });
}

async function createCorpusRepo(names, prefix = undefined) {
  const base = await mkdtemp(path.join(tmpdir(), "blast-repo-source-"));
  const origin = path.join(base, "origin");
  await mkdir(origin, { recursive: true });
  git(["init", "-q"], origin);
  git(["config", "user.email", "test@blast.local"], origin);
  git(["config", "user.name", "blast-test"], origin);
  for (const name of names) {
    const directory = prefix === undefined ? path.join(origin, name) : path.join(origin, prefix, name);
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({ name, version: "1.0.0", commands: [{ name: "index", mode: "view" }] }),
      "utf8",
    );
    await writeFile(path.join(directory, "src", "index.tsx"), "export default function Command() {}\n", "utf8");
  }
  git(["add", "-A"], origin);
  git(["commit", "-qm", "corpus"], origin);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: origin }).toString().trim();
  return { base, origin, revision };
}

test("fetches selected extensions and reports missing names", async (t) => {
  const { base, origin, revision } = await createCorpusRepo(["ext-a", "ext-b"]);
  t.after(() => rm(base, { recursive: true, force: true }));
  const cacheDir = path.join(base, "cache");
  const targetRoot = path.join(base, "target");

  const result = await fetchExtensionsFromRepo({
    repoUrl: origin,
    revision,
    extensionNames: ["ext-a", "no-such-ext"],
    cacheDir,
    targetRoot,
  });

  assert.deepEqual(result.fetched, ["ext-a"]);
  assert.deepEqual(result.missing, ["no-such-ext"]);
  const manifest = JSON.parse(await readFile(path.join(targetRoot, "ext-a", "package.json"), "utf8"));
  assert.equal(manifest.name, "ext-a");

  // A second run reuses the cached clone without refetching from scratch.
  const again = await fetchExtensionsFromRepo({
    repoUrl: origin,
    revision,
    extensionNames: ["ext-b"],
    cacheDir,
    targetRoot,
  });
  assert.deepEqual(again.fetched, ["ext-b"]);
  assert.deepEqual(again.missing, []);
});

test("fetches extensions nested under the default extensions/ prefix", async (t) => {
  const { base, origin, revision } = await createCorpusRepo(["ext-a", "ext-b"], "extensions");
  t.after(() => rm(base, { recursive: true, force: true }));
  const cacheDir = path.join(base, "cache");
  const targetRoot = path.join(base, "target");

  const result = await fetchExtensionsFromRepo({
    repoUrl: origin,
    revision,
    extensionNames: ["ext-a", "no-such-ext"],
    cacheDir,
    targetRoot,
  });

  assert.deepEqual(result.fetched, ["ext-a"]);
  assert.deepEqual(result.missing, ["no-such-ext"]);
  const manifest = JSON.parse(await readFile(path.join(targetRoot, "ext-a", "package.json"), "utf8"));
  assert.equal(manifest.name, "ext-a");
});

test("rejects unsafe extension names and relative paths", async (t) => {
  const { base, origin, revision } = await createCorpusRepo(["ext-a"]);
  t.after(() => rm(base, { recursive: true, force: true }));

  for (const name of ["..", "a/b", "", "-flag"]) {
    await assert.rejects(
      () =>
        fetchExtensionsFromRepo({
          repoUrl: origin,
          revision,
          extensionNames: [name],
          cacheDir: path.join(base, "cache"),
          targetRoot: path.join(base, "target"),
        }),
      (error) => error instanceof ExtensionRepoSourceError && error.code === "invalid_repo_options",
    );
  }
  await assert.rejects(
    () =>
      fetchExtensionsFromRepo({
        repoUrl: origin,
        revision,
        extensionNames: ["ext-a"],
        cacheDir: "relative/cache",
        targetRoot: path.join(base, "target"),
      }),
    (error) => error instanceof ExtensionRepoSourceError && error.code === "invalid_repo_options",
  );
  await assert.rejects(
    () =>
      fetchExtensionsFromRepo({
        repoUrl: origin,
        revision,
        extensionNames: [],
        cacheDir: path.join(base, "cache"),
        targetRoot: path.join(base, "target"),
      }),
    (error) => error instanceof ExtensionRepoSourceError && error.code === "invalid_repo_options",
  );
});

test("enforces archive bounds instead of reporting missing", async (t) => {
  const { base, origin, revision } = await createCorpusRepo(["ext-a"]);
  t.after(() => rm(base, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      fetchExtensionsFromRepo({
        repoUrl: origin,
        revision,
        extensionNames: ["ext-a"],
        cacheDir: path.join(base, "cache"),
        targetRoot: path.join(base, "target"),
        maxArchiveEntries: 1,
      }),
    (error) => error instanceof ExtensionRepoSourceError && error.code === "repo_archive_too_large",
  );
});
