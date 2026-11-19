import { BrowserExtension, Detail, environment } from "@raycast/api";
import { useEffect, useState } from "react";

async function waitForTabs() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await BrowserExtension.getTabs();
    } catch (error) {
      if (
        attempt >= 80 ||
        !(error instanceof Error) ||
        !error.message.includes("companion extension")
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

export default function Command() {
  const [content, setContent] = useState<string>();
  useEffect(() => {
    void (async () => {
      const tabs = await waitForTabs();
      const active = await BrowserExtension.getContent();
      const specific = await BrowserExtension.getContent({
        tabId: tabs[0].id,
        format: "html",
        cssSelector: "main",
      });
      return `browser available:${environment.canAccess(BrowserExtension)} ${active} ${specific}`;
    })().then(setContent, (error) => setContent(`failed: ${error.message}`));
  }, []);
  return <Detail isLoading={content === undefined} markdown={content ?? "Loading"} />;
}
