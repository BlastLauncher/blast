import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  applyViewPatch,
  EMBEDDER_PROTOCOL_VERSION,
  type SceneNode,
  type ViewPatchOp,
} from "@blastlauncher/protocol";

const noop = () => {};
const nodePath = execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();

export function createClientHarness() {
  const cleanups: (() => Promise<void>)[] = [];

  async function cleanup() {
    await Promise.all(cleanups.splice(0).map((clean) => clean()));
  }

  async function client(native = false, args: string[] = [], env: Record<string, string> = {}) {
    const dir = await mkdtemp(join(tmpdir(), "blast-serve-"));
    const child = spawn(
      nodePath,
      [
        resolve("packages/serve/src/main.ts"),
        ...(native ? ["--native"] : []),
        // The server defaults to auto installs; tests must never reach the network.
        ...(args.includes("--dependencies") ? [] : ["--dependencies", "manual"]),
        ...args,
      ],
      { env: { ...process.env, XDG_DATA_HOME: dir, ...env }, stdio: ["pipe", "pipe", "pipe"] },
    );
    const messages: Record<string, any>[] = [];
    const sessionStates = new Map<string, { view: any; revision: number }>();
    const rootStates = new Map<string, { view: any; revision: number }>();
    const sessionViewEvents: Array<{
      session: string;
      view: any;
      revision: number;
      event: string;
    }> = [];
    const rootViewEvents: Array<{ root: string; view: any; revision: number; event: string }> = [];
    let buffer = "",
      stderr = "",
      notify = noop;
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      buffer += chunk;
      for (;;) {
        const end = buffer.indexOf("\n");
        if (end < 0) break;
        const parsed = JSON.parse(buffer.slice(0, end)) as Record<string, any>;
        messages.push(parsed);
        if (parsed.type === "event") {
          if (parsed.event === "session.view") {
            const state = { view: parsed.view, revision: parsed.revision as number };
            sessionStates.set(parsed.session, state);
            sessionViewEvents.push({ session: parsed.session, ...state, event: parsed.event });
          } else if (parsed.event === "session.view.patch") {
            const prev = sessionStates.get(parsed.session);
            if (!prev)
              throw new Error(`session.view.patch before session.view for ${parsed.session}`);
            const next = applyViewPatch(
              prev.view,
              {
                revision: parsed.revision as number,
                baseRevision: parsed.baseRevision as number,
                ops: parsed.ops as ViewPatchOp[],
              },
              prev.revision,
            );
            const state = { view: next, revision: parsed.revision as number };
            sessionStates.set(parsed.session, state);
            sessionViewEvents.push({ session: parsed.session, ...state, event: parsed.event });
          } else if (parsed.event === "root.view") {
            const state = { view: parsed.view, revision: parsed.revision as number };
            rootStates.set(parsed.root, state);
            rootViewEvents.push({ root: parsed.root, ...state, event: parsed.event });
          } else if (parsed.event === "root.view.patch") {
            const prev = rootStates.get(parsed.root);
            if (!prev) throw new Error(`root.view.patch before root.view for ${parsed.root}`);
            const next = applyViewPatch(
              prev.view,
              {
                revision: parsed.revision as number,
                baseRevision: parsed.baseRevision as number,
                ops: parsed.ops as ViewPatchOp[],
              },
              prev.revision,
            );
            const state = { view: next, revision: parsed.revision as number };
            rootStates.set(parsed.root, state);
            rootViewEvents.push({ root: parsed.root, ...state, event: parsed.event });
          }
        }
        buffer = buffer.slice(end + 1);
      }
      notify();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const exited = new Promise<number | null>((done) => child.on("close", done));
    cleanups.push(async () => {
      child.kill("SIGKILL");
      await exited;
      await rm(dir, { recursive: true, force: true });
    });
    let sequence = 0;
    const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
    const waitFrom = async <T>(list: T[], predicate: (v: T) => boolean, ms = 8000) => {
      const timeout = setTimeout(() => notify(), ms);
      const deadline = Date.now() + ms;
      try {
        for (;;) {
          const index = list.findIndex(predicate);
          if (index >= 0) return list.splice(index, 1)[0]!;
          if (Date.now() >= deadline) throw new Error(`Timed out: ${stderr}`);
          await new Promise<void>((done) => {
            notify = done;
          });
        }
      } finally {
        clearTimeout(timeout);
      }
    };
    const wait = (predicate: (v: Record<string, any>) => boolean, ms = 8000) =>
      waitFrom(messages, predicate, ms);
    const waitSessionView = (
      session: string,
      match: (view: any) => boolean = () => true,
      ms = 8000,
    ) => waitFrom(sessionViewEvents, (e) => e.session === session && match(e.view), ms);
    const waitRootView = (root: string, match: (view: any) => boolean = () => true, ms = 8000) =>
      waitFrom(rootViewEvents, (e) => e.root === root && match(e.view), ms);
    const request = async (method: string, params: unknown = {}) => {
      const id = String(++sequence);
      send({ type: "request", id, method, params });
      return wait((v) => v.type === "response" && v.id === id);
    };
    return {
      dir,
      child,
      messages: () => messages,
      send,
      wait,
      waitSessionView,
      waitRootView,
      request,
      exited,
      async hello(capabilities: string[] = [], views?: unknown, scenes?: boolean) {
        send({
          type: "hello",
          protocol: EMBEDDER_PROTOCOL_VERSION,
          capabilities,
          ...(views === undefined ? {} : { views }),
          ...(scenes === undefined ? {} : { scenes }),
        });
        return wait((v) => v.type === "welcome");
      },
    };
  }

  return { client, cleanup, cleanups };
}

export function find(
  root: SceneNode | null,
  predicate: (node: SceneNode) => boolean,
): SceneNode | undefined {
  if (!root) return;
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
}
