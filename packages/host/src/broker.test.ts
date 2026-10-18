import { expect, test } from "bun:test";
import { createBroker } from "./broker.ts";

test("broker capabilities require explicit grants and preserve payloads", async () => {
  for (const [name, params] of [
    ["open.url", { url: "https://example.com" }],
    ["open.path", { path: "/tmp/report.txt", application: "TextEdit" }],
    ["clipboard.paste", { text: "paste me" }],
    ["clipboard.clear", {}],
    ["clipboard.read", { offset: 1 }],
    ["applications.list", { path: "/tmp/report.txt" }],
    ["preferences.open", { scope: "extension" }],
  ] as const) {
    const request = { type: "capability.request", id: "action", name, params } as const;
    expect(await createBroker({})(request)).toMatchObject({ ok: false, error: { code: "denied" } });
    const calls: unknown[] = [];
    const granted = createBroker({
      [name]: (payload) => {
        calls.push(payload);
      },
    });
    expect(await granted(request)).toEqual({
      type: "capability.result",
      id: "action",
      ok: true,
      value: null,
    });
    expect(calls).toEqual([params]);
    const failed = createBroker({
      [name]: () => {
        throw new Error("OS operation failed");
      },
    });
    expect(await failed(request)).toMatchObject({
      ok: false,
      error: { code: "failed", message: "OS operation failed" },
    });
  }
});
