import { expect, test } from "bun:test";
import type { CapabilityResultMessage, JsonValue } from "@blastlauncher/protocol";
import { createBroker, type Broker } from "./broker.ts";
import { createHeadlessHandlers, parseApplications } from "./headless.ts";

const safari = { name: "Safari", path: "/Applications/Safari.app", bundleId: "com.apple.Safari" };

function ask(
  broker: Broker,
  name: string,
  params: JsonValue,
  id = "1",
): Promise<CapabilityResultMessage> {
  return broker({ type: "capability.request", id, name, params });
}

test("the headless defaults answer applications, the clipboard and preferences", async () => {
  const broker = createBroker(createHeadlessHandlers({ applications: [safari], clipboard: "hi" }));
  expect(await ask(broker, "applications.list", {})).toEqual({
    type: "capability.result",
    id: "1",
    ok: true,
    value: [safari],
  });
  // A path cannot narrow a list the caller supplied wholesale.
  expect(await ask(broker, "applications.list", { path: "/tmp/report.txt" })).toMatchObject({
    ok: true,
    value: [safari],
  });
  expect(await ask(broker, "clipboard.read", {})).toMatchObject({
    ok: true,
    value: { text: "hi" },
  });
  expect(await ask(broker, "clipboard.read", { offset: 0 })).toMatchObject({
    ok: true,
    value: { text: "hi" },
  });
  // There is no history behind the current entry.
  expect(await ask(broker, "clipboard.read", { offset: 2 })).toMatchObject({
    ok: true,
    value: { text: "" },
  });
  for (const scope of ["extension", "command"]) {
    expect(await ask(broker, "preferences.open", { scope })).toMatchObject({
      ok: true,
      value: null,
    });
  }
});

test("the headless defaults are empty by default and reject malformed params", async () => {
  const broker = createBroker(createHeadlessHandlers());
  expect(await ask(broker, "applications.list", {})).toMatchObject({ ok: true, value: [] });
  expect(await ask(broker, "clipboard.read", {})).toMatchObject({ ok: true, value: { text: "" } });
  for (const [name, params] of [
    ["applications.list", { path: 5 }],
    ["clipboard.read", { offset: 6 }],
    ["clipboard.read", { offset: -1 }],
    ["preferences.open", { scope: "workspace" }],
    ["preferences.open", null],
  ] as const) {
    expect(await ask(broker, name, params)).toMatchObject({ ok: false, error: { code: "failed" } });
  }
});

test("the headless defaults leave everything that changes the machine denied", async () => {
  const broker = createBroker(createHeadlessHandlers({ clipboard: "hi" }));
  for (const name of ["clipboard.paste", "clipboard.clear", "clipboard.copy", "open.url"]) {
    expect(await ask(broker, name, {})).toMatchObject({ ok: false, error: { code: "denied" } });
  }
});

test("parseApplications reads a JSON array of applications and rejects anything else", () => {
  expect(parseApplications(JSON.stringify([safari]))).toEqual([safari]);
  expect(parseApplications("[]")).toEqual([]);
  for (const [text, message] of [
    ["{}", "must be a JSON array of applications"],
    ["nope", "not JSON"],
    ['[{"name":"Safari"}]', 'application 1 must be an object with string "name" and "path"'],
    [
      '[{"name":"Safari","path":2}]',
      'application 1 must be an object with string "name" and "path"',
    ],
  ] as const) {
    expect(() => parseApplications(text)).toThrow(message);
  }
});
