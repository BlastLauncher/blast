import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createLineDecoder,
  encodeMessage,
  parseRuntimeMessage,
  PROTOCOL_VERSION,
  type CommandMode,
  type HostMessage,
  type InitEnvironment,
  type JsonValue,
  type RuntimeMessage,
} from "@blastlauncher/protocol";

const noop = () => {};

const defaultEnvironment: InitEnvironment = {
  extensionName: "fixture",
  commandName: "command",
  assetsPath: "",
  supportPath: "",
  isDevelopment: true,
};

export type InitOptions = {
  fixture?: string;
  protocol?: number;
  mode?: CommandMode;
  preferences?: Record<string, JsonValue>;
  environment?: InitEnvironment;
  arguments?: Record<string, string>;
  launchContext?: Record<string, JsonValue>;
};

export function startRuntime() {
  const child = spawn("node", [fileURLToPath(new URL("./main.ts", import.meta.url))], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const messages: RuntimeMessage[] = [];
  const invalid: string[] = [];
  let stderr = "";
  let cursor = 0;
  let wake = noop;
  let closed = false;
  const decoder = createLineDecoder({
    onLine(value) {
      const parsed = parseRuntimeMessage(value);
      if (parsed.ok) messages.push(parsed.message);
      else invalid.push(parsed.error);
      wake();
    },
    onError(error) {
      invalid.push(error);
      wake();
    },
  });
  child.stdout.on("data", (chunk) => decoder.push(chunk));
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      decoder.end();
      closed = true;
      wake();
      resolve(code);
    });
  });
  return {
    child,
    messages,
    invalid,
    exited,
    get stderr() {
      return stderr;
    },
    send(message: HostMessage) {
      child.stdin.write(encodeMessage(message));
    },
    init(options: InitOptions = {}) {
      this.send({
        type: "init",
        protocol: options.protocol ?? PROTOCOL_VERSION,
        command: {
          extension: "fixture",
          name: "command",
          entry: fileURLToPath(
            new URL(
              `../../../fixtures/runtime/${options.fixture ?? "command.js"}`,
              import.meta.url,
            ),
          ),
          mode: options.mode ?? "view",
          ...(options.arguments === undefined ? {} : { arguments: options.arguments }),
          ...(options.launchContext === undefined ? {} : { launchContext: options.launchContext }),
        },
        preferences: options.preferences ?? {},
        environment: options.environment ?? defaultEnvironment,
      });
    },
    async next<T extends RuntimeMessage["type"]>(
      type: T,
    ): Promise<Extract<RuntimeMessage, { type: T }>> {
      for (;;) {
        if (invalid.length) throw new Error(invalid.join("\n"));
        while (cursor < messages.length) {
          const message = messages[cursor++]!;
          if (message.type === type) return message as Extract<RuntimeMessage, { type: T }>;
        }
        if (closed) throw new Error(`Exited waiting for ${type}: ${stderr}`);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 3000);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
    },
  };
}
