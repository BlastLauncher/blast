import { expect, test } from "bun:test";
import { HUD_DURATION_MS } from "./hud.ts";

test("a HUD shows for Raycast's 2.5 s before it fades", () => {
  expect(HUD_DURATION_MS).toBe(2500);
});
