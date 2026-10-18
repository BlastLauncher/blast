import { ActionPanel, Action, List, Clipboard as CB } from "@raycast/api";
import type { Icon } from "@raycast/api";

export default function Index() {
  return (
    <List
      actions={
        <ActionPanel>
          <Action title="Copy" onAction={() => CB.copy("text")} />
        </ActionPanel>
      }
    />
  );
}

export async function loadDetail() {
  const api = await import("@raycast/api");
  return api.Detail;
}

export const icon: Icon = "circle";
