import { Action, ActionPanel, BrowserExtension, List, ToastStyle, clearSearchBar, trash } from "@raycast/api";
import type { Tool } from "@raycast/api";
import { useEffect, useState } from "react";

type Input = { path: string };

const confirmation: Tool.Confirmation<Input> = async ({ path }) => ({
  style: "destructive",
  message: "Move this path to the trash?",
  info: [{ name: "Path", value: path }],
});

void confirmation;

export default function Command() {
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    let active = true;
    void (async () => {
      const tabs = await BrowserExtension.getTabs();
      const content = await BrowserExtension.getContent({ format: "text", tabId: tabs[0]?.id });
      await clearSearchBar({ forceScrollToTop: true });
      await trash(["/tmp/fixture-one", "/tmp/fixture-two"]);
      if (active) {
        setStatus(`${tabs.length}:${content}:${ToastStyle.Success}`);
      }
    })().catch((error: unknown) => {
      if (active) {
        setStatus(`error:${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <List navigationTitle={`Host:${status}`}>
      <List.Item title="Host boundaries" actions={<ActionPanel><Action title="Ready" /></ActionPanel>} />
    </List>
  );
}
