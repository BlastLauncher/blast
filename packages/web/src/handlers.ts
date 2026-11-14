import type {
  BrowserStorage,
  CapabilityContext,
  CapabilityRequest,
  CapabilityResult,
  ClipboardBridge,
} from "./capabilities.ts";

/**
 * How the embedding page answers the capabilities an extension asks for.
 * Anything left out falls back to the package default (decision 0015).
 */
export type WebHandlers = {
  storage?: BrowserStorage;
  clipboard?: ClipboardBridge;
  openUrl?: (url: string) => void;
  /**
   * Answers any capability before the defaults see it: return a result to
   * grant it, or `{ ok: false, error: { code: "DENIED", ... } }` to deny it.
   * Return undefined to let the default handler answer.
   */
  capability?: (
    request: CapabilityRequest,
    context: CapabilityContext,
  ) => CapabilityResult | undefined | Promise<CapabilityResult | undefined>;
};

/** localStorage, the Clipboard API (the browser asks the user) and a new tab for URLs. */
export function createDefaultHandlers(): WebHandlers {
  let storage: BrowserStorage | undefined;
  try {
    storage = globalThis.localStorage;
  } catch {
    // Blocked storage (private windows, sandboxed frames): capabilities fall back to memory.
  }
  return {
    ...(storage ? { storage } : {}),
    clipboard: {
      readText: () => navigator.clipboard.readText(),
      writeText: (text) => navigator.clipboard.writeText(text),
    },
    openUrl: (url) => {
      // Only web URLs: an extension must not open javascript: or file: links.
      if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer");
    },
  };
}
