import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyViewPatch } from "../../packages/protocol/src/index.ts";
import {
  VIEW_PATCH_FIXTURES_FILE,
  buildViewPatchFixtures,
  type ViewPatchFixtures,
} from "./generate-view-patch-fixtures.ts";

describe("shared view-patch fixtures", () => {
  test("fixtures/protocol/view-patches.json is up to date and round-trips", () => {
    const filePath = join(process.cwd(), VIEW_PATCH_FIXTURES_FILE);
    const actual = JSON.parse(readFileSync(filePath, "utf8")) as ViewPatchFixtures;
    const expected = buildViewPatchFixtures();
    expect(actual).toEqual(expected);

    const opsSeen = new Set<string>();
    for (const item of actual.cases) {
      for (const op of item.patch.ops) opsSeen.add(op.op);
      const patched = applyViewPatch(item.prev, item.patch, item.patch.baseRevision);
      expect(patched).toEqual(item.next);
    }
    expect(opsSeen).toEqual(new Set(["set", "delete", "splice"]));
  });
});
