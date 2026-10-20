import type { JsonValue } from "@blastlauncher/protocol";
import type { CapabilityHandler } from "@blastlauncher/host";

export type BrowserTab = {
  id: number;
  url: string;
  active: boolean;
  title?: string;
  favicon?: string;
  content?: string;
};
export function parseBrowserTabs(text: string): BrowserTab[] {
  const tabs: unknown = JSON.parse(text);
  if (!Array.isArray(tabs)) throw new Error("must be a JSON array of tabs");
  const ids = new Set<number>();
  return tabs.map((tab, index) => {
    if (
      !tab ||
      typeof tab !== "object" ||
      !Number.isInteger(tab.id) ||
      typeof tab.url !== "string" ||
      typeof tab.active !== "boolean"
    )
      throw new Error(`tab ${index + 1} requires integer id, string url and boolean active`);
    if (ids.has(tab.id)) throw new Error(`duplicate tab id ${tab.id}`);
    ids.add(tab.id);
    const result: BrowserTab = { id: tab.id, url: tab.url, active: tab.active };
    for (const field of ["title", "favicon", "content"] as const) {
      if (tab[field] !== undefined) {
        if (typeof tab[field] !== "string")
          throw new Error(`tab ${index + 1}: ${field} must be a string`);
        result[field] = tab[field];
      }
    }
    return result;
  });
}
export function createBrowserHandlers(tabs: BrowserTab[]): Record<string, CapabilityHandler> {
  return {
    "browser.tabs": () => tabs.map(({ content: _content, ...tab }) => tab),
    "browser.content": (params: JsonValue) => {
      if (!params || typeof params !== "object" || Array.isArray(params))
        throw new Error("browser.content: expected options");
      if (
        params.tabId !== undefined &&
        (typeof params.tabId !== "number" || !Number.isInteger(params.tabId))
      )
        throw new Error("browser.content: invalid tabId");
      if (
        params.format !== undefined &&
        !["html", "text", "markdown"].includes(String(params.format))
      )
        throw new Error("browser.content: invalid format");
      if (params.cssSelector !== undefined)
        throw new Error("browser.content: headless content does not support CSS selectors");
      const tab =
        params.tabId === undefined
          ? tabs.find((candidate) => candidate.active)
          : tabs.find((candidate) => candidate.id === params.tabId);
      if (tab?.content === undefined)
        throw new Error("browser.content: no content supplied for tab");
      return tab.content;
    },
  };
}
