import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAlfredFixture } from "../../host/src/test-helper.ts";
import { createClientHarness } from "./serve-test-helper.ts";

const { client, cleanup } = createClientHarness();
afterEach(cleanup);
let scratch = "";
let fixture: { dir: string; archive: string };
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "blast-serve-alfred-"));
  fixture = await writeAlfredFixture(scratch);
});
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const ids = (view: any): string[] =>
  view.rows.filter((r: any) => r.kind === "item").map((r: any) => r.id);
const titled = (view: any, title: string) => view.rows?.find((r: any) => r.title === title);

test("an .alfredworkflow opens, lists in a root and runs a Script Filter over protocol 2", async () => {
  const c = await client();
  await c.hello(["clipboard.copy", "open.url"], { platform: "Linux" });
  const opened = await c.request("extension.open", { dir: fixture.archive });
  expect(opened.ok).toBe(true);
  const extension = opened.result.extension;
  // An archive has nothing to watch, and watching it must not fail.
  expect((await c.request("extension.watch", { extension })).ok).toBe(true);
  const manifest = await c.request("extension.manifest", { extension });
  expect(manifest.result.commands.map((command: any) => command.name)).toEqual(["greet", "site"]);

  const { result } = await c.request("root.open", {});
  const root = result.root;
  const listed = await c.waitRootView(root, (view) => ids(view).length === 2);
  expect(ids(listed.view)).toEqual(["com.example.greeter:greet", "com.example.greeter:site"]);
  // Icons resolve in the extracted workflow under the engine's data directory.
  const icon = titled(listed.view, "Greet").iconSource;
  expect(icon.kind).toBe("file");
  expect(icon.path.startsWith(join(c.dir, "blast", "workflows"))).toBe(true);
  expect(icon.path.endsWith("/sf.png")).toBe(true);

  await c.request("root.input", { root, input: { type: "primary" } });
  const launched = await c.wait((v) => v.event === "root.launched");
  const session = launched.session;
  const input = (value: unknown) => c.request("session.input", { session, input: value });
  const form = await c.waitSessionView(session, (view) => view.kind === "form");
  expect(form.view.form.fields.map((f: any) => f.id)).toEqual(["token"]);
  await input({ type: "setValue", id: "token", value: "abc" });
  await input({ type: "primary" });
  await c.waitSessionView(session, (view) => view.kind === "list" && view.title === "Greet");

  await input({ type: "search", text: "world" });
  const results = await c.waitSessionView(
    session,
    (view) => titled(view, "Hello world")?.subtitle === "token abc",
  );
  expect(titled(results.view, "Hello world").iconSource.path).toBe(icon.path);
  await input({ type: "primary" });
  const request = await c.wait((v) => v.type === "capability.request");
  expect(request).toMatchObject({ session, name: "clipboard.copy", params: { text: "world" } });
  c.send({ type: "capability.result", id: request.id, ok: true, value: null });

  // The copy closes the window: the session ends and the root takes input again.
  await c.wait((v) => v.event === "session.exited" && v.session === session);
  expect(c.messages().some((message) => message.event === "session.view.patch")).toBe(true);
  await c.request("root.input", { root, input: { type: "primary" } });
  const again = (await c.wait((v) => v.event === "root.launched")).session;
  // The token was saved: straight to the Script Filter, no prompt.
  const view = await c.waitSessionView(again, (next) => next.kind !== "empty");
  expect(view.view).toMatchObject({ kind: "list", title: "Greet" });
  await c.request("session.close", { session: again });
  await c.wait((v) => v.event === "session.exited" && v.session === again);

  expect((await c.request("extension.close", { extension })).ok).toBe(true);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 30_000);

test("extension.launch runs a workflow directory's Keyword with its argument", async () => {
  const c = await client();
  await c.hello(["open.url"], { platform: "Linux" });
  const { result } = await c.request("extension.open", { dir: fixture.dir });
  const extension = result.extension;
  await c.request("extension.savePreferences", {
    extension,
    command: "site",
    values: { token: "abc" },
  });
  const missing = await c.request("extension.launch", { extension, command: "site" });
  expect(missing.error).toMatchObject({ code: "missing_values", data: { arguments: ["query"] } });

  const launched = await c.request("extension.launch", {
    extension,
    command: "site",
    argumentValues: { query: "docs" },
  });
  expect(launched.ok).toBe(true);
  const request = await c.wait((v) => v.type === "capability.request");
  expect(request).toMatchObject({
    session: launched.result.session,
    name: "open.url",
    params: { url: "https://example.com/docs" },
  });
  c.send({ type: "capability.result", id: request.id, ok: true, value: null });
  const exited = await c.wait(
    (v) => v.event === "session.exited" && v.session === launched.result.session,
  );
  expect(exited.code).toBe(0);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 30_000);
