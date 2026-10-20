import { expect, test } from "bun:test";
import { createBroker } from "@blastlauncher/host";
import { parseBrowserTabs } from "./browser.ts";
import { createHeadlessHandlers } from "./headless.ts";

test("browser input validates fields and duplicate ids", () => {
  for (const text of [
    "bad",
    "{}",
    "[null]",
    '[{"id":1,"url":"x","active":true,"content":7}]',
    '[{"id":1,"url":"x","active":true},{"id":1,"url":"y","active":false}]',
  ])
    expect(() => parseBrowserTabs(text)).toThrow();
  expect(parseBrowserTabs('[{"id":1,"url":"x","active":false,"favicon":"icon"}]')).toEqual([
    { id: 1, url: "x", active: false, favicon: "icon" },
  ]);
});

test("headless browser content selects tabs, hides content in tab lists, and rejects absent content and unsupported selectors", async () => {
  const broker = createBroker(
    createHeadlessHandlers({
      browserTabs: [
        { id: 1, url: "x", active: true, content: "" },
        { id: 2, url: "y", active: false },
      ],
      aiAnswer: "answer",
    }),
  );
  const request = (name: string, params = {}) =>
    broker({ type: "capability.request", id: "test", name, params });
  expect(await request("browser.tabs")).toMatchObject({
    ok: true,
    value: [
      { id: 1, url: "x", active: true },
      { id: 2, url: "y", active: false },
    ],
  });
  expect(await request("browser.content")).toMatchObject({ ok: true, value: "" });
  expect(await request("ai.ask", { prompt: "q" })).toMatchObject({ ok: true, value: "answer" });
  for (const params of [
    { tabId: 2 },
    { tabId: 9 },
    { tabId: "1" },
    { cssSelector: "main" },
    { format: "bad" },
  ])
    expect(await request("browser.content", params)).toMatchObject({
      ok: false,
      error: { code: "failed" },
    });
  const denied = createBroker(createHeadlessHandlers());
  for (const name of ["ai.ask", "browser.tabs", "browser.content"])
    expect(
      await denied({ type: "capability.request", id: "test", name, params: {} }),
    ).toMatchObject({ ok: false, error: { code: "denied" } });
});
