import {
  bundleCommand,
  defaultDataDir,
  createPreferenceStore,
  startCommand,
  createSessionBroker,
  type CapabilityHandler,
} from "@blastlauncher/host";
import { dirname } from "node:path";
import { rm } from "node:fs/promises";

export async function openCommand(
  extensionDir: string,
  command: string,
  options: {
    dataDir?: string;
    handlers?: Record<string, CapabilityHandler>;
    /** Manifest argument values for this launch, keyed by argument name. */
    argumentValues?: Record<string, string>;
  } = {},
) {
  const effects = createClientHandlers();
  const dataDir = options.dataDir ?? defaultDataDir();
  const bundled = await bundleCommand({ extensionDir, command, dataDir });
  const cleanup = () => rm(dirname(bundled.entry), { recursive: true, force: true });
  try {
    const storage = {
      extensionName: bundled.extensionName,
      dataDir,
    };
    const session = await startCommand({
      ...bundled,
      preferences: await createPreferenceStore({
        extensionName: bundled.extensionName,
        dataDir,
      }).values(command),
      dataDir,
      ...(options.argumentValues === undefined ? {} : { argumentValues: options.argumentValues }),
      broker: createSessionBroker(storage, {
        handlers: { ...effects.handlers, ...options.handlers },
      }),
    });
    let closing: Promise<void> | undefined;
    return {
      session,
      effects,
      close: () =>
        (closing ??= (async () => {
          try {
            await session.shutdown({ timeoutMs: 5000 });
          } finally {
            await cleanup();
          }
        })()),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Clipboard and URL effects are local to this terminal session. */
export function createClientHandlers() {
  let clipboard: Record<string, import("@blastlauncher/protocol").JsonValue> = { text: "" };
  const urls: string[] = [];
  const copy: CapabilityHandler = (params) => {
    if (!params || typeof params !== "object" || Array.isArray(params))
      throw new Error("Invalid clipboard content");
    clipboard = { text: typeof params.text === "string" ? params.text : "" };
    for (const name of ["file", "html"])
      if (typeof params[name] === "string") clipboard[name] = params[name];
  };
  const handlers: Record<string, CapabilityHandler> = {
    "clipboard.copy": copy,
    "clipboard.paste": copy,
    "clipboard.clear": () => {
      clipboard = { text: "" };
    },
    "clipboard.read": (params) => {
      const offset =
        params && typeof params === "object" && !Array.isArray(params) ? params.offset : undefined;
      if (
        offset !== undefined &&
        (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 5)
      )
        throw new Error("Invalid clipboard offset");
      return offset ? { text: "" } : { ...clipboard };
    },
    "open.url": (params) => {
      if (
        !params ||
        typeof params !== "object" ||
        Array.isArray(params) ||
        typeof params.url !== "string"
      )
        throw new Error("Invalid URL");
      urls.push(params.url);
    },
  };
  return { handlers, urls };
}
