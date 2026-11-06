import type { Catalog } from "./root.ts";

export type BrowserStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

export type ClipboardBridge = {
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
};

export type CapabilityRequest = { name: string; params: unknown };
export type CapabilityResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: "DENIED"; message: string } };

export type CapabilityContext = {
  extensionName: string;
  commandName: string;
  source: string;
};

export type BrowserCapabilityOptions = {
  catalog: Catalog;
  storage?: BrowserStorage;
  clipboard?: ClipboardBridge;
  openUrl?: (url: string) => void;
  launchCommand?: (source: string, command: string) => Promise<void>;
  status?: (message: string, error?: boolean) => void;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const denial = (message: string): CapabilityResult => ({
  ok: false,
  error: { code: "DENIED", message },
});

function paramsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extensionEntry(catalog: Catalog, name: string) {
  return catalog.extensions.find((extension) => extension.name === name);
}

const keyFor = (extension: string, key: string, internal: boolean) =>
  // User keys get their own namespace so a LocalStorage key such as
  // "internal:x" can never collide with Blast's internal or OAuth entries.
  `blast:${extension}:${internal ? "internal" : "user"}:${key}`;
const decode = (value: string | null): JsonValue | null => {
  if (value === null) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
};
const tokenKey = (extension: string, provider: string) =>
  keyFor(extension, `oauth:${provider}`, true);

/** Browser-backed capability handlers. All browser effects are injected for unit tests. */
export function createBrowserCapabilities(options: BrowserCapabilityOptions) {
  const memory = new Map<string, string>();
  let copied = "";
  const browserStorage = options.storage;

  const read = (key: string): string | null => {
    try {
      return browserStorage?.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  };
  const write = (key: string, value: string) => {
    memory.set(key, value);
    try {
      browserStorage?.setItem(key, value);
    } catch {
      // Private browsing and disabled storage are expected; memory is the fallback.
    }
  };
  const remove = (key: string) => {
    memory.delete(key);
    try {
      browserStorage?.removeItem(key);
    } catch {
      // The memory value has already been removed.
    }
  };
  const all = (extension: string): Record<string, JsonValue> => {
    const prefix = `blast:${extension}:user:`;
    const values = new Map<string, string>();
    try {
      for (let index = 0; index < (browserStorage?.length ?? 0); index++) {
        const storedKey = browserStorage?.key(index);
        if (storedKey?.startsWith(prefix)) {
          const name = storedKey.slice(prefix.length);
          const value = browserStorage?.getItem(storedKey);
          if (typeof value === "string") values.set(name, value);
        }
      }
    } catch {
      // Merge the memory fallback below.
    }
    for (const [storedKey, value] of memory) {
      if (storedKey.startsWith(prefix)) values.set(storedKey.slice(prefix.length), value);
    }
    const result: Record<string, JsonValue> = {};
    for (const [name, value] of values) {
      try {
        result[name] = JSON.parse(value) as JsonValue;
      } catch {
        // Ignore values written by another application under our prefix.
      }
    }
    return result;
  };
  const clear = (extension: string) => {
    const prefix = `blast:${extension}:user:`;
    const keys = new Set<string>();
    for (const key of memory.keys()) if (key.startsWith(prefix)) keys.add(key);
    try {
      for (let index = 0; index < (browserStorage?.length ?? 0); index++) {
        const key = browserStorage?.key(index);
        if (key?.startsWith(prefix)) keys.add(key);
      }
    } catch {
      // Clear the known memory keys even when browser storage is inaccessible.
    }
    for (const key of keys) remove(key);
  };
  return async function handle(
    request: CapabilityRequest,
    context: CapabilityContext,
  ): Promise<CapabilityResult> {
    const params = paramsOf(request.params);
    if (
      request.name === "storage.get" ||
      request.name === "storage.set" ||
      request.name === "storage.remove"
    ) {
      const key = typeof params.key === "string" ? params.key : "";
      if (!key) return denial(`${request.name} requires a non-empty key`);
      const storedKey = keyFor(context.extensionName, key, params.scope === "blast:internal");
      if (request.name === "storage.get") return { ok: true, value: decode(read(storedKey)) };
      if (request.name === "storage.remove") {
        remove(storedKey);
        return { ok: true, value: null };
      }
      write(storedKey, JSON.stringify(params.value));
      return { ok: true, value: null };
    }
    if (request.name === "storage.all") {
      return { ok: true, value: all(context.extensionName) };
    }
    if (request.name === "storage.clear") {
      clear(context.extensionName);
      return { ok: true, value: null };
    }
    if (request.name === "oauth.tokens.get") {
      return {
        ok: true,
        value: decode(read(tokenKey(context.extensionName, String(params.providerId ?? "")))),
      };
    }
    if (request.name === "oauth.tokens.set") {
      write(
        tokenKey(context.extensionName, String(params.providerId ?? "")),
        JSON.stringify(params.tokens),
      );
      return { ok: true, value: null };
    }
    if (request.name === "oauth.tokens.remove") {
      remove(tokenKey(context.extensionName, String(params.providerId ?? "")));
      return { ok: true, value: null };
    }
    if (request.name === "clipboard.copy" || request.name === "clipboard.paste") {
      const text = typeof params.text === "string" ? params.text : "";
      copied = text;
      try {
        await options.clipboard?.writeText?.(text);
      } catch {
        // The session fallback still makes read useful when permission is denied.
      }
      if (request.name === "clipboard.paste") options.status?.("Copied — paste with ⌘V");
      else options.status?.("Copied");
      return { ok: true, value: null };
    }
    if (request.name === "clipboard.read") {
      try {
        const text = await options.clipboard?.readText?.();
        if (typeof text === "string") return { ok: true, value: { text } };
      } catch {
        // Fall back to the last value Blast copied in this session.
      }
      return { ok: true, value: { text: copied } };
    }
    if (request.name === "clipboard.clear") {
      copied = "";
      return { ok: true, value: null };
    }
    if (request.name === "open.url") {
      const url = typeof params.url === "string" ? params.url : "";
      options.openUrl?.(url);
      return { ok: true, value: null };
    }
    if (request.name === "command.metadata") {
      const command = extensionEntry(options.catalog, context.extensionName)?.commands.find(
        (item) => item.name === context.commandName,
      );
      return command
        ? { ok: true, value: null }
        : denial("This command is not in the browser catalog");
    }
    if (request.name === "command.launch") {
      const targetExtension = String(params.extensionName ?? context.extensionName);
      if (targetExtension !== context.extensionName)
        return denial("The browser demo can launch commands only from the current extension");
      const command = typeof params.name === "string" ? params.name : "";
      if (
        !extensionEntry(options.catalog, targetExtension)?.commands.some(
          (item) => item.name === command,
        )
      )
        return denial("That command is not in the browser catalog");
      if (!options.launchCommand)
        return denial("Command launching is unavailable in this browser session");
      await options.launchCommand(context.source, command);
      return { ok: true, value: null };
    }
    if (request.name === "oauth.authorize")
      return denial(
        "OAuth authorization needs a host redirect and is unavailable in a browser tab",
      );
    if (request.name === "preferences.open")
      return denial("Preferences are managed by the browser demo host");
    if (request.name.startsWith("applications."))
      return denial("Applications are unavailable in a browser tab");
    if (request.name.startsWith("selection."))
      return denial("Selection is unavailable in a browser tab");
    if (request.name.startsWith("window."))
      return denial("Window management is unavailable in a browser tab");
    if (request.name.startsWith("ai.")) return denial("AI access is unavailable in a browser tab");
    return denial(`${request.name} is not supported by the browser demo`);
  };
}
