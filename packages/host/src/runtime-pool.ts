// Pre-warmed standby runtime worker pool. Preserves decision 0001: every
// command still runs in its own fresh, dedicated, never-reused Node child.
// Keeping one idle child booted (with `@blastlauncher/runtime/api` preloaded)
// moves Node/React/shim startup off the launch critical path.
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

export type RuntimeChild = ChildProcessByStdio<Writable, Readable, Readable>;

export type RuntimeSpawnSpec = {
  nodePath: string;
  env: Record<string, string>;
};

type StandbyEntry = {
  key: string;
  child: RuntimeChild;
  alive: boolean;
  onExit: () => void;
  onError: () => void;
};

const runtimeEntry = fileURLToPath(import.meta.resolve("@blastlauncher/runtime/main"));

function envKey(spec: RuntimeSpawnSpec): string {
  const keys = Object.keys(spec.env).toSorted();
  let out = spec.nodePath;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    out += `\0${k}=${spec.env[k]}`;
  }
  return out;
}

function spawnFresh(spec: RuntimeSpawnSpec, prewarmArg: boolean): RuntimeChild {
  return spawn(spec.nodePath, prewarmArg ? [runtimeEntry, "--prewarm"] : [runtimeEntry], {
    stdio: ["pipe", "pipe", "pipe"],
    env: spec.env,
  });
}

export type RuntimePool = {
  /** Ensures one clean standby worker is warming for `spec` (no-op if already present). */
  prewarm(spec: RuntimeSpawnSpec): void;
  /** Claims a warm standby worker for `spec`, or spawns fresh; replenishes in the background. */
  acquire(spec: RuntimeSpawnSpec, replenish?: boolean): RuntimeChild;
  /** Immediately terminates all unclaimed standby workers. */
  close(): void;
};

export function createRuntimePool(): RuntimePool {
  let closed = false;
  let standby: StandbyEntry | undefined;

  function dropStandby(entry: StandbyEntry): void {
    entry.alive = false;
    entry.child.off("exit", entry.onExit);
    entry.child.off("error", entry.onError);
    if (standby === entry) standby = undefined;
  }

  function killStandby(): void {
    if (!standby) return;
    const current = standby;
    dropStandby(current);
    try {
      current.child.kill("SIGKILL");
    } catch {
      // Already exited.
    }
  }

  function prewarm(spec: RuntimeSpawnSpec): void {
    if (closed) return;
    const key = envKey(spec);
    if (standby && standby.alive && standby.key === key) return;
    if (standby && standby.key !== key) killStandby();

    const child = spawnFresh(spec, true);
    // Do not keep the host event loop alive solely for an unused standby worker.
    child.unref();
    const entry: StandbyEntry = {
      key,
      child,
      alive: true,
      onExit: () => dropStandby(entry),
      onError: () => dropStandby(entry),
    };
    child.once("exit", entry.onExit);
    child.once("error", entry.onError);
    standby = entry;
  }

  function acquire(spec: RuntimeSpawnSpec, replenish = true): RuntimeChild {
    const key = envKey(spec);
    let claimed: RuntimeChild | undefined;
    if (standby && standby.alive && standby.key === key && !standby.child.killed) {
      const entry = standby;
      dropStandby(entry);
      entry.child.ref();
      claimed = entry.child;
    }
    const child = claimed ?? spawnFresh(spec, false);
    if (replenish && !closed) {
      // Replenish on a macrotask so the freshly claimed launch gets CPU priority first.
      const timer = setTimeout(() => {
        if (!closed) prewarm(spec);
      }, 0);
      timer.unref();
    }
    return child;
  }

  return {
    prewarm,
    acquire,
    close() {
      closed = true;
      killStandby();
    },
  };
}
