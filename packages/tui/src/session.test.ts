import { expect, test } from "bun:test";
import { createBroker } from "@blastlauncher/host";
import { createClientHandlers } from "./session.ts";
import type { JsonValue } from "@blastlauncher/protocol";

test("terminal clipboard and URL handlers stay local and other effects are denied", async () => {
  const effects = createClientHandlers();
  const broker = createBroker(effects.handlers);
  const request = (name: string, params: JsonValue = {}) =>
    broker({ type: "capability.request", id: "1", name, params });
  await request("clipboard.copy", { html: "<b>hello</b>", text: "hello" });
  expect(await request("clipboard.read")).toMatchObject({
    ok: true,
    value: { html: "<b>hello</b>", text: "hello" },
  });
  expect(await request("clipboard.read", { offset: 1 })).toMatchObject({ value: { text: "" } });
  await request("clipboard.paste", { file: "/tmp/example" });
  expect(await request("clipboard.read")).toMatchObject({
    value: { text: "", file: "/tmp/example" },
  });
  await request("clipboard.clear");
  expect(await request("clipboard.read")).toMatchObject({ value: { text: "" } });
  await request("open.url", { url: "https://example.com" });
  expect(effects.urls).toEqual(["https://example.com"]);
  expect(await request("open.path", { path: "/tmp/example" })).toMatchObject({
    ok: false,
    error: { code: "denied" },
  });
  expect(
    await createBroker(createClientHandlers().handlers)({
      type: "capability.request",
      id: "2",
      name: "clipboard.read",
      params: {},
    }),
  ).toMatchObject({ value: { text: "" } });
});
