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
    ["command.metadata", null],
    ["command.metadata", { subtitle: 5 }],
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

test("headless metadata updates are granted by default", async () => {
  const broker = createBroker(createHeadlessHandlers());
  for (const params of [{ subtitle: "Current thing" }, { subtitle: null }, {}]) {
    expect(await ask(broker, "command.metadata", params)).toMatchObject({ ok: true, value: null });
  }
});

test("selection and frontmost defaults are deterministic and configurable", async () => {
  const defaults = createBroker(createHeadlessHandlers());
  expect(await ask(defaults, "selection.text", {})).toMatchObject({
    ok: false,
    error: { code: "failed", message: "No text selected" },
  });
  expect(await ask(defaults, "selection.files", {})).toMatchObject({ ok: true, value: [] });
  expect(await ask(defaults, "applications.frontmost", {})).toMatchObject({
    ok: true,
    value: { name: "Headless", path: "" },
  });
  const configured = createBroker(
    createHeadlessHandlers({
      selectedText: "hello",
      selectedFiles: ["/tmp/a", "/tmp/b"],
      frontmost: safari.bundleId,
      applications: [safari],
    }),
  );
  expect(await ask(configured, "selection.text", {})).toMatchObject({ ok: true, value: "hello" });
  expect(await ask(configured, "selection.files", {})).toMatchObject({
    ok: true,
    value: [{ path: "/tmp/a" }, { path: "/tmp/b" }],
  });
  expect(await ask(configured, "applications.frontmost", {})).toMatchObject({
    ok: true,
    value: safari,
  });
  const synthetic = createBroker(createHeadlessHandlers({ frontmost: "org.editor" }));
  expect(await ask(synthetic, "applications.frontmost", {})).toMatchObject({
    ok: true,
    value: { name: "org.editor", path: "", bundleId: "org.editor" },
  });
  for (const name of ["selection.text", "selection.files", "applications.frontmost"]) {
    expect(await ask(createBroker(), name, {})).toMatchObject({
      ok: false,
      error: { code: "denied" },
    });
    expect(await ask(configured, name, null)).toMatchObject({
      ok: false,
      error: { code: "failed" },
    });
  }
});

// @covers WindowManagement.getDesktops
// @covers WindowManagement.getActiveWindow
// @covers WindowManagement.getWindowsOnActiveDesktop
test("window management answers neutrally: one desktop, no windows, no active window", async () => {
  const broker = createBroker(createHeadlessHandlers());
  expect(await ask(broker, "window.desktops", {})).toEqual({
    type: "capability.result",
    id: "1",
    ok: true,
    value: [
      {
        id: "headless-desktop",
        screenId: "headless-screen",
        active: true,
        type: "User",
        size: { width: 0, height: 0 },
      },
    ],
  });
  expect(await ask(broker, "window.list", {})).toMatchObject({ ok: true, value: [] });
  // Raycast rejects when no window is active, which is always the case here.
  expect(await ask(broker, "window.active", {})).toMatchObject({
    ok: false,
    error: { code: "failed", message: "No active window" },
  });
  for (const name of ["window.desktops", "window.list", "window.active"]) {
    expect(await ask(broker, name, null)).toMatchObject({
      ok: false,
      error: { code: "failed" },
    });
  }
});

// @covers WindowManagement.setWindowBounds
test("window.setBounds is an effect and stays denied unless granted", async () => {
  const params = { id: "window-1", bounds: { position: { x: 100 } } };
  expect(await ask(createBroker(createHeadlessHandlers()), "window.setBounds", params)).toMatchObject(
    { ok: false, error: { code: "denied" } },
  );
  const received: JsonValue[] = [];
  const broker = createBroker({
    "window.setBounds": (value) => {
      received.push(value);
    },
  });
  expect(await ask(broker, "window.setBounds", params)).toMatchObject({ ok: true, value: null });
  expect(received).toEqual([params]);
});

// @covers getDefaultApplication
test("applications.default rejects like Raycast when no application exists", async () => {
  const broker = createBroker(createHeadlessHandlers({ applications: [safari] }));
  expect(await ask(broker, "applications.default", { path: "/tmp/report.txt" })).toMatchObject({
    ok: false,
    error: { code: "failed", message: "No default application for /tmp/report.txt" },
  });
  for (const params of [{}, { path: "" }, { path: 5 }]) {
    expect(await ask(broker, "applications.default", params)).toMatchObject({
      ok: false,
      error: { code: "failed" },
    });
  }
  // Nothing answers it without the headless handler installed.
  expect(
    await ask(createBroker(), "applications.default", { path: "/tmp/report.txt" }),
  ).toMatchObject({ ok: false, error: { code: "denied" } });
});

test("finder and trash effects require explicit grants and pass parameters to the handler", async () => {
  for (const [name, params] of [
    ["finder.show", { path: "/tmp/a" }],
    ["trash", { paths: ["/tmp/a", "/tmp/b"] }],
  ] as Array<[string, JsonValue]>) {
    expect(await ask(createBroker(createHeadlessHandlers()), name, params)).toMatchObject({
      ok: false,
      error: { code: "denied" },
    });
    const received: JsonValue[] = [];
    const broker = createBroker({
      [name]: (value) => {
        received.push(value);
      },
    });
    expect(await ask(broker, name, params)).toMatchObject({ ok: true, value: null });
    expect(received).toEqual([params]);
  }
});
