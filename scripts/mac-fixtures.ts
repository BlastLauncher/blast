// Contract fixtures for the Swift client: launch fixture extensions through the
// real `blast serve` with views enabled and record the `ControllerView` each
// scenario settles on. `--check` regenerates them in memory and fails when the
// committed files differ, so `bun run verify` catches a drifted engine.
//
// Output is deterministic: object keys sorted, one view per file, no paths,
// ids from the engine's own counters and a throwaway data directory.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURE_DIRECTORY = "examples/macos-launcher/Tests/Fixtures";
export const FIXTURE_NAMES = [
  "list",
  "grid",
  "detail",
  "form",
  "menu-bar",
  "toast",
  "action-panel",
  "root",
  "prompt",
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

type Message = Record<string, unknown>;
type View = {
  kind?: string;
  actions?: { open?: boolean };
  feedback?: { toast?: unknown };
  [key: string]: unknown;
};

const VIEW_TIMEOUT_MS = 30_000;

class ServeSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly repository: string;
  private readonly exited: Promise<void>;
  private readonly messages: Message[] = [];
  private readonly views: View[] = [];
  private readonly rootViews: View[] = [];
  private readonly stderr: string[] = [];
  private buffer = "";
  private consumed = 0;
  private sequence = 0;
  private exitCode: number | null | undefined;
  private session = "";
  private root = "";

  private constructor(child: ChildProcessWithoutNullStreams, root: string) {
    this.child = child;
    this.repository = root;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      for (;;) {
        const newline = this.buffer.indexOf("\n");
        if (newline < 0) break;
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (line) this.receive(line);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => this.stderr.push(chunk));
    child.on("exit", (code) => {
      this.exitCode = code;
    });
    this.exited = new Promise((resolve) => child.on("close", () => resolve()));
  }

  static async start(root: string, dataDirectory: string): Promise<ServeSession> {
    const child = spawn("node", [join(root, "packages/serve/src/main.ts")], {
      cwd: root,
      env: { ...process.env, XDG_DATA_HOME: dataDirectory },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const session = new ServeSession(child, root);
    await session.handshake();
    return session;
  }

  async open(name: string): Promise<string> {
    return this.openDirectory(join(this.repository, "fixtures/extensions", name));
  }

  async openDirectory(dir: string): Promise<string> {
    const result = (await this.request("extension.open", { dir })) as { extension?: string };
    if (!result.extension) throw new Error(`extension.open returned no extension for ${dir}`);
    return result.extension;
  }

  /** Opens the engine root over the opened extensions, returning its first view. */
  async openRoot(): Promise<View> {
    const before = this.rootViews.length;
    const result = (await this.request("root.open", { views: { platform: "macOS" } })) as {
      root?: string;
    };
    if (!result.root) throw new Error("root.open returned no root");
    this.root = result.root;
    return this.waitFor(() => this.rootViews[before], "the first root view");
  }

  /** Sends root input that launches a command, then follows the launched session. */
  async launchFromRoot(input: Record<string, unknown>): Promise<void> {
    if (!this.root) throw new Error("no root is open");
    await this.request("root.input", { root: this.root, input });
    const launched = await this.waitFor(
      () =>
        this.messages.find(
          (message) => message.event === "root.launched" && message.root === this.root,
        ),
      "root.launched",
    );
    this.session = String(launched.session);
  }

  /** Opens and launches a fixture command with `views`, returning its first view. */
  async launch(name: string, command: string): Promise<View> {
    const extension = await this.open(name);
    const before = this.views.length;
    const result = (await this.request("extension.launch", {
      extension,
      command,
      views: { platform: "macOS" },
    })) as { session?: string };
    if (!result.session) throw new Error(`extension.launch returned no session for ${name}`);
    this.session = result.session;
    const view = await this.waitFor(() => this.views[before], `${name}/${command} first view`);
    return this.take(view);
  }

  async input(input: Record<string, unknown>): Promise<void> {
    if (!this.session) throw new Error("no session is launched");
    await this.request("session.input", { session: this.session, input });
  }

  /** Waits for a view newer than the last one returned, then consumes it. */
  async waitView(predicate: (view: View) => boolean, label: string): Promise<View> {
    const view = await this.waitFor(() => this.views.slice(this.consumed).find(predicate), label);
    return this.take(view);
  }

  async shutdown(): Promise<void> {
    await this.request("engine.shutdown", {});
  }

  async close(): Promise<void> {
    if (this.exitCode === undefined) this.child.kill("SIGKILL");
    await this.exited;
  }

  private async handshake(): Promise<void> {
    this.send({ type: "hello", protocol: 1, capabilities: [] });
    await this.waitFor(
      () => (this.messages.some((message) => message.type === "welcome") ? true : undefined),
      "the welcome message",
    );
  }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = String(++this.sequence);
    this.send({ type: "request", id, method, params });
    const response = await this.waitFor(
      () => this.messages.find((message) => message.type === "response" && message.id === id),
      `${method} response`,
    );
    if (response.ok !== true) {
      const error = response.error as { code?: string; message?: string } | undefined;
      throw new Error(
        `${method} failed: ${error?.code ?? "unknown"}: ${error?.message ?? "no message"}`,
      );
    }
    return response.result ?? null;
  }

  private send(message: Message): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    const message = JSON.parse(line) as Message;
    this.messages.push(message);
    if (message.type === "event" && message.event === "session.view") {
      this.views.push(message.view as View);
    }
    if (message.type === "event" && message.event === "root.view") {
      this.rootViews.push(message.view as View);
    }
  }

  private take(view: View): View {
    this.consumed = Math.max(this.consumed, this.views.lastIndexOf(view) + 1);
    return view;
  }

  private async waitFor<T>(find: () => T | undefined, label: string): Promise<T> {
    const deadline = Date.now() + VIEW_TIMEOUT_MS;
    for (;;) {
      const value = find();
      if (value !== undefined) return value;
      if (this.exitCode !== undefined) {
        throw new Error(`serve exited (code ${this.exitCode}) while waiting for ${label}`);
      }
      if (Date.now() > deadline) {
        const stderr = this.stderr.join("").trim();
        throw new Error(
          `timed out waiting for ${label}${stderr ? `\nserve stderr:\n${stderr}` : ""}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

const scenarios: Record<FixtureName, (serve: ServeSession, scratch: string) => Promise<View>> = {
  list: (serve) => serve.launch("hello-list", "index"),
  grid: (serve) => serve.launch("grid", "index"),
  detail: async (serve) => {
    await serve.launch("host-session", "navigation");
    await serve.input({ type: "openActions" });
    await serve.waitView((view) => view.actions?.open === true, "the navigation action panel");
    await serve.input({ type: "move", direction: "down" });
    await serve.input({ type: "primary" });
    return serve.waitView((view) => view.kind === "detail", "the pushed detail view");
  },
  form: (serve) => serve.launch("form", "index"),
  "menu-bar": (serve) => serve.launch("menu-bar", "index"),
  toast: async (serve) => {
    await serve.launch("feedback", "index");
    await serve.input({ type: "alert", confirm: true });
    return serve.waitView((view) => Boolean(view.feedback?.toast), "the toast view");
  },
  "action-panel": async (serve) => {
    await serve.launch("actions-variants", "index");
    await serve.input({ type: "openActions" });
    return serve.waitView((view) => view.actions?.open === true, "the open action panel");
  },
  root: async (serve) => {
    await serve.open("hello-list");
    return serve.openRoot();
  },
  // The 0157 prompt fixture: engine-handle with a required preference and
  // argument, so a root launch shows the launch prompt form.
  prompt: async (serve, scratch) => {
    const dir = join(scratch, "prompt-extension");
    await cp(join(repositoryRoot, "fixtures/extensions/engine-handle"), dir, { recursive: true });
    const file = join(dir, "package.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    manifest.preferences = [{ name: "token", type: "password", title: "Token", required: true }];
    manifest.commands[0].arguments = [{ name: "query", type: "text", required: true }];
    await writeFile(file, JSON.stringify(manifest));
    await serve.openDirectory(dir);
    await serve.openRoot();
    await serve.launchFromRoot({ type: "primary" });
    return serve.waitView((view) => view.kind === "form", "the launch prompt form");
  },
};

/** Sorts object keys recursively so a recorded view is byte-stable. */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .toSorted()
        .map((key) => [key, sortKeys(object[key])]),
    );
  }
  return value;
}

/** Icon sources are absolute paths; recorded fixtures must not embed this checkout's location. */
export function renderFixture(view: unknown): string {
  return `${JSON.stringify(sortKeys(view), null, 2)}\n`.replaceAll(
    JSON.stringify(repositoryRoot).slice(1, -1),
    "<repository>",
  );
}

export function compareFixtures(
  expected: Record<string, string>,
  actual: Record<string, string>,
): string[] {
  const problems: string[] = [];
  for (const name of Object.keys(expected).toSorted()) {
    const content = actual[name];
    if (content === undefined) problems.push(`${name}.json: missing`);
    else if (content !== expected[name]) problems.push(`${name}.json: stale`);
  }
  for (const name of Object.keys(actual).toSorted()) {
    if (!(name in expected)) problems.push(`${name}.json: unexpected file`);
  }
  return problems;
}

export async function readFixtures(directory: string): Promise<Record<string, string>> {
  const names = (await readdir(directory).catch(() => []))
    .filter((name) => name.endsWith(".json"))
    .toSorted();
  const entries = await Promise.all(
    names.map(async (name) => {
      const content = await readFile(join(directory, name), "utf8");
      return [name.slice(0, -".json".length), content] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function generateFixtures(root: string): Promise<Record<FixtureName, string>> {
  const dataDirectory = await mkdtemp(join(tmpdir(), "blast-mac-fixtures-"));
  try {
    const entries: Array<[FixtureName, string]> = [];
    for (const name of FIXTURE_NAMES) {
      const serve = await ServeSession.start(root, dataDirectory);
      try {
        entries.push([name, renderFixture(await scenarios[name](serve, dataDirectory))]);
        await serve.shutdown();
      } finally {
        await serve.close();
      }
    }
    return Object.fromEntries(entries) as Record<FixtureName, string>;
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const directory = join(repositoryRoot, FIXTURE_DIRECTORY);
  const expected = await generateFixtures(repositoryRoot);
  if (process.argv.includes("--check")) {
    const problems = compareFixtures(expected, await readFixtures(directory));
    for (const problem of problems) console.error(`mac-fixtures: ${problem}`);
    if (problems.length) {
      console.error("mac-fixtures: run `bun run example:mac:fixtures`");
      process.exit(1);
    }
    console.log(`mac-fixtures: ${FIXTURE_NAMES.length} fixtures match`);
    return;
  }
  await mkdir(directory, { recursive: true });
  let changed = 0;
  for (const name of FIXTURE_NAMES) {
    const path = join(directory, `${name}.json`);
    const previous = await readFile(path, "utf8").catch(() => "");
    if (previous === expected[name]) continue;
    await writeFile(path, expected[name]);
    changed += 1;
  }
  console.log(`mac-fixtures: wrote ${changed} of ${FIXTURE_NAMES.length} fixtures`);
}

if (import.meta.main) await main();
