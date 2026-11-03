import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeStaleClone } from "./batch.ts";

test("a clone with an unowned git lock is replaced on start", async () => {
  const root = mkdtempSync(join(tmpdir(), "blast-batch-"));
  const clone = join(root, ".cache/raycast-extensions");
  mkdirSync(join(clone, ".git"), { recursive: true });
  writeFileSync(join(clone, ".git", "index.lock"), "");
  writeFileSync(join(clone, "sentinel"), "stale");

  expect(await removeStaleClone(root)).toBe(true);
  expect(existsSync(clone)).toBe(false);
  await rm(root, { recursive: true, force: true });
});
