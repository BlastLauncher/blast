import { createHeadlessHandlers } from "@blastlauncher/cli";
import { openExtension, type CapabilityHandler, type ExtensionHandle } from "@blastlauncher/host";

export async function openCommand(
  extensionDir: string,
  command: string,
  options: {
    dataDir?: string;
    handlers?: Record<string, CapabilityHandler>;
    argumentValues?: Record<string, string>;
    extension?: ExtensionHandle;
  } = {},
) {
  const effects = createClientHandlers();
  const extension =
    options.extension ??
    openExtension({
      extensionDir,
      ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
    });
  try {
    const opened = await extension.launch(command, {
      ...(options.argumentValues === undefined ? {} : { argumentValues: options.argumentValues }),
      handlers: { ...createHeadlessHandlers(), ...effects.handlers, ...options.handlers },
    });
    return {
      ...opened,
      effects,
      close: async () => {
        await opened.close();
        if (!options.extension) await extension.close();
      },
    };
  } catch (error) {
    if (!options.extension) await extension.close();
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
