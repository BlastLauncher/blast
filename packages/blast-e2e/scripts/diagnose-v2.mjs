// Automated V2 error discovery for the Electron-owned daemon path.
//
// Mirrors the Electron main-process flow (CoreClientHost over
// connectLocalCoreClient) without launching Electron:
//   socket checks -> connect/handshake -> discovery -> optional run-command
//   smoke -> shutdown. Prints a millisecond timeline plus actionable hints.
//
// Usage:
//   pnpm --filter @blastlauncher/e2e run diagnose:v2 -- [--socket PATH]
//     [--extension ID] [--command NAME] [--run] [--timeout MS] [--json]
//
// Requires built workspace output (pnpm run build).

import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_SOCKET = path.join(homedir(), ".blast", "v2", "core.sock");

function parseArgs(argv) {
  const options = {
    socket: process.env.BLAST_V2_SOCKET_PATH ?? DEFAULT_SOCKET,
    extensionId: undefined,
    commandName: undefined,
    run: false,
    timeoutMilliseconds: 15_000,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--socket") {
      options.socket = argv[++index] ?? options.socket;
    } else if (arg === "--extension") {
      options.extensionId = argv[++index];
    } else if (arg === "--command") {
      options.commandName = argv[++index];
    } else if (arg === "--run") {
      options.run = true;
    } else if (arg === "--timeout") {
      options.timeoutMilliseconds = Number(argv[++index]) || options.timeoutMilliseconds;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: pnpm run diagnose:v2 -- [--socket PATH] [--extension ID] [--command NAME] [--run] [--timeout MS] [--json]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function withTimeout(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref();
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function errorRecord(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: typeof error.code === "string" ? error.code : undefined,
    };
  }
  return { name: "Unknown", message: String(error) };
}

function hintFor(code, message) {
  switch (code) {
    case "controller_closed":
      return "The client controller closed cleanly (daemon restart or socket close). Retry start() to reconnect; the Electron renderer now does this automatically.";
    case "host_already_started":
      return "A controller already exists. If it is failed/closed, start() now reconnects (fixed); otherwise stop the active command first.";
    case "command_discovery_failed":
    case "catalog_root_unreadable":
      return "Check BLAST_V2_CATALOG_ROOT / packaged dev-extensions root and daemon stderr (DEBUG=electron-client*).";
    case "socket_connect_failed":
    case "socket_closed_before_connect":
    case "socket_connect_timeout":
      return "The daemon socket is missing or not accepting. Start the app (packaged V2 daemon) or pass --socket, then check daemon listen errors.";
    case "command_start_failed":
      return "Discovery worked but the extension process failed. Check daemon stderr and run with --run to capture start-failed details.";
    default:
      return message.includes("timed out")
        ? "A step stalled: the daemon may be starting, the catalog may be large, or an extension process hung. Re-run with --timeout 30000."
        : "See the timeline above; use --json for machine-readable output and DEBUG=electron-client* for main-process logs.";
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  const timeline = [];
  const record = (step, status, detail) => {
    timeline.push({ atMs: elapsed(), step, status, ...(detail === undefined ? {} : { detail }) });
  };

  let exitCode = 0;
  let outcome = {};
  const { CoreClientHost } = await import("@blastlauncher/client");
  const { connectLocalCoreClient } = await import("@blastlauncher/core-node");

  record("node", "ok", process.version);
  record("socket_path", "ok", options.socket);

  try {
    const stats = await lstat(options.socket);
    record("socket_lstat", "ok", stats.isSocket() ? "socket" : `not-a-socket:${stats.isFile() ? "file" : "other"}`);
    if (!stats.isSocket()) {
      throw new Error(`Socket path exists but is not a socket: ${options.socket}`);
    }
  } catch (error) {
    record("socket_lstat", "fail", errorRecord(error).message);
    outcome = { ok: false, stage: "socket_lstat", error: errorRecord(error) };
    exitCode = 1;
    return finish();
  }

  let sequence = 0;
  const host = new CoreClientHost({
    connect: () =>
      connectLocalCoreClient({
        socketPath: options.socket,
        implementation: { name: "v2-diagnose", version: "0.0.0" },
        createMessageId: () => `v2-diagnose-${++sequence}`,
      }),
  });
  const snapshots = [];
  const unsubscribe = host.subscribe((snapshot) => snapshots.push({ atMs: elapsed(), ...snapshot }));

  try {
    record("connect_start", "pending");
    const snapshot = await withTimeout(host.start(), options.timeoutMilliseconds, "V2 start/discovery");
    record("connect_start", "ok", `state=${snapshot.state} commands=${snapshot.commands.length}`);
    outcome.discovery = { commands: snapshot.commands.length };

    const target =
      options.extensionId !== undefined && options.commandName !== undefined
        ? { extensionId: options.extensionId, commandName: options.commandName }
        : snapshot.commands[0] !== undefined
          ? { extensionId: snapshot.commands[0].extensionId, commandName: snapshot.commands[0].commandName }
          : undefined;
    if (target !== undefined) {
      outcome.target = target;
      record("target", "ok", `${target.extensionId}/${target.commandName}`);
    } else {
      record("target", "skip", "empty catalog; nothing to run");
    }

    if (options.run) {
      if (target === undefined) {
        record("run", "skip", "no command available");
      } else {
        record("run_start", "pending", `${target.extensionId}/${target.commandName}`);
        try {
          await withTimeout(
            (async () => {
              await host.runCommand(target);
              await withTimeout(
                waitFor(host, (s) => s.state === "running" || s.error !== undefined, snapshots),
                10_000,
                "command running",
              );
            })(),
            options.timeoutMilliseconds,
            "V2 run-command",
          );
          record("run_start", "ok", `state=${host.snapshot?.state}`);
          outcome.run = { state: host.snapshot?.state, scene: host.snapshot?.scene !== undefined };
        } catch (error) {
          const rec = errorRecord(error);
          record("run_start", "fail", `[${rec.code ?? "unknown"}] ${rec.message}`);
          outcome.run = { error: rec };
          exitCode = 1;
        } finally {
          try {
            await withTimeout(host.stopCommand("v2-diagnose complete"), 5_000, "V2 stop");
            await withTimeout(
              waitFor(host, (s) => s.state === "ready" || s.state === "failed" || s.state === "closed", snapshots),
              10_000,
              "command stopped",
            ).catch(() => {});
            record("stop", "ok", `state=${host.snapshot?.state}`);
          } catch (error) {
            record("stop", "fail", errorRecord(error).message);
          }
        }
      }
    }

    outcome = { ok: exitCode === 0, stage: "complete", ...outcome };
  } catch (error) {
    const rec = errorRecord(error);
    record("connect_start", "fail", `[${rec.code ?? "unknown"}] ${rec.message}`);
    outcome = { ok: false, stage: "connect_start", error: rec, hint: hintFor(rec.code ?? "", rec.message) };
    exitCode = 1;
  } finally {
    try {
      await host.close("v2-diagnose complete");
      record("close", "ok", `state=${host.snapshot?.state}`);
    } catch (error) {
      record("close", "fail", errorRecord(error).message);
    } finally {
      unsubscribe();
    }
  }

  function finish() {
    if (options.json) {
      console.log(JSON.stringify({ socket: options.socket, timeline, outcome }, null, 2));
    } else {
      for (const entry of timeline) {
        console.log(
          `${String(entry.atMs).padStart(6)}ms  ${entry.step}: ${entry.status}${entry.detail ? `  ${entry.detail}` : ""}`,
        );
      }
      if (!outcome.ok) {
        console.error(`\nFAILED at ${outcome.stage}: [${outcome.error?.code ?? "unknown"}] ${outcome.error?.message}`);
        console.error(`Hint: ${outcome.hint ?? hintFor(outcome.error?.code ?? "", outcome.error?.message ?? "")}`);
        console.error(
          "Next: run with --run --extension <id> --command <name> for a command smoke, or DEBUG=electron-client* pnpm --filter blast run start",
        );
      } else {
        console.log(`\nOK: discovery saw ${outcome.discovery?.commands ?? 0} command(s).`);
        if (options.run) {
          console.log(`Run smoke: ${JSON.stringify(outcome.run)}`);
        } else {
          console.log("Tip: add --run to smoke-test the first command end to end.");
        }
      }
    }
    process.exitCode = exitCode;
  }

  finish();

  function waitFor(currentHost, predicate, seen) {
    return (async () => {
      if (currentHost.snapshot !== undefined && predicate(currentHost.snapshot)) {
        return currentHost.snapshot;
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("wait for snapshot timed out")), 10_000);
        timer.unref();
        const off = currentHost.subscribe((snapshot) => {
          if (predicate(snapshot)) {
            clearTimeout(timer);
            off();
            resolve(snapshot);
          }
        });
        void seen;
      });
    })();
  }
}

main().catch((error) => {
  console.error(`v2-diagnose crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
