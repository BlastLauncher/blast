import { requestCapability } from "./capability.ts";
import { AI as enums } from "./enums.generated.ts";
import type { ActionStyle } from "./action.ts";

export const OPTIONAL_API = Symbol.for("blast.optionalAPI");
export type Creativity = "none" | "low" | "medium" | "high" | "maximum" | number;
export type ModelSelector = (typeof enums.Model)[keyof typeof enums.Model] | { id: string };
export type AskOptions = { creativity?: Creativity; model?: ModelSelector; signal?: AbortSignal };

function ask(
  prompt: string,
  options: AskOptions = {},
): Promise<string> & {
  on(event: "data", listener: (chunk: string) => void): void;
} {
  const listeners: ((chunk: string) => void)[] = [];
  const promise = new Promise<string>((resolve, reject) => {
    const signal = options.signal;
    let settled = false;
    const finish = (error: unknown, text?: string) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else {
        try {
          for (const listener of listeners) listener(text!);
          resolve(text!);
        } catch (listenerError) {
          reject(listenerError);
        }
      }
    };
    const abort = () => finish(new DOMException("The operation was aborted", "AbortError"));
    if (signal?.aborted) {
      abort();
      return;
    }
    if (typeof options.model === "object") {
      finish(new Error("AI.ask: model providers are not supported yet"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    const params = {
      prompt,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.creativity === undefined
        ? {}
        : {
            creativity:
              typeof options.creativity === "number"
                ? Math.max(0, Math.min(2, options.creativity))
                : options.creativity,
          }),
    };
    void requestCapability("ai.ask", params).then(
      (text) =>
        typeof text === "string"
          ? finish(null, text)
          : finish(new Error("AI.ask: expected a text answer")),
      (error) => finish(error),
    );
  });
  return Object.assign(promise, {
    on(_event: "data", listener: (chunk: string) => void): void {
      listeners.push(listener);
    },
  });
}

export const AI = { [OPTIONAL_API]: "AI", Model: enums.Model, ask };
export const unstable_AI = AI;
export const useUnstableAI = (): undefined => undefined;
export type BrowserTab = {
  id: number;
  url: string;
  title?: string;
  favicon?: string;
  active: boolean;
};
export type BrowserContentOptions = {
  cssSelector?: string;
  tabId?: number;
  format?: "html" | "text" | "markdown";
};
export const BrowserExtension = {
  [OPTIONAL_API]: "BrowserExtension",
  async getTabs(): Promise<BrowserTab[]> {
    const tabs = await requestCapability("browser.tabs", {});
    if (
      !Array.isArray(tabs) ||
      tabs.some(
        (tab) =>
          !tab ||
          typeof tab !== "object" ||
          Array.isArray(tab) ||
          typeof tab.id !== "number" ||
          typeof tab.url !== "string" ||
          typeof tab.active !== "boolean" ||
          (tab.title !== undefined && typeof tab.title !== "string") ||
          (tab.favicon !== undefined && typeof tab.favicon !== "string"),
      )
    )
      throw new Error("BrowserExtension.getTabs: invalid tabs answer");
    return tabs as BrowserTab[];
  },
  async getContent(options: BrowserContentOptions = {}): Promise<string> {
    if (options.cssSelector !== undefined && options.format === "markdown")
      throw new Error("BrowserExtension.getContent: cssSelector cannot be used with markdown");
    const content = await requestCapability("browser.content", { ...options });
    if (typeof content !== "string")
      throw new Error("BrowserExtension.getContent: expected text content");
    return content;
  },
};
export type ToolConfirmation<T> = (input: T) => Promise<
  | undefined
  | {
      style?: ActionStyle;
      info?: { name: string; value?: string }[];
      message?: string;
      image?: string | { fileIcon: string };
    }
>;
// Tool currently contains only type declarations.
export const Tool = {};
