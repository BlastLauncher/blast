import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeStaleClone } from "./batch.ts";
import { CORPUS_DIR } from "./corpus.ts";

function makeClone(): string {
  const root = mkdtempSync(join(tmpdir(), "blast-batch-"));
  mkdirSync(join(root, CORPUS_DIR, ".git", "info"), { recursive: true });
  writeFileSync(join(root, CORPUS_DIR, "sentinel"), "stale");
  return root;
}

test("a clone left with index.lock is replaced when no git process owns it", async () => {
  const root = makeClone();
  try {
    writeFileSync(join(root, CORPUS_DIR, ".git", "index.lock"), "");
    expect(await removeStaleClone(root)).toBe(true);
    expect(existsSync(join(root, CORPUS_DIR))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a clone left with info/sparse-checkout.lock is replaced", async () => {
  const root = makeClone();
  try {
    writeFileSync(join(root, CORPUS_DIR, ".git", "info", "sparse-checkout.lock"), "");
    expect(await removeStaleClone(root, () => false)).toBe(true);
    expect(existsSync(join(root, CORPUS_DIR))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a clone without a lock is kept", async () => {
  const root = makeClone();
  try {
    expect(await removeStaleClone(root, () => false)).toBe(false);
    expect(existsSync(join(root, CORPUS_DIR, "sentinel"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a lock held by a running git process is left for that process", async () => {
  const root = makeClone();
  try {
    writeFileSync(join(root, CORPUS_DIR, ".git", "index.lock"), "");
    expect(await removeStaleClone(root, () => true)).toBe(false);
    expect(existsSync(join(root, CORPUS_DIR, "sentinel"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an empty root is refused before anything is deleted", async () => {
  expect(removeStaleClone("", () => false)).rejects.toThrow(/non-empty/);
});
