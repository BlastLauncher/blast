import {
  Action,
  ActionPanel,
  Alert,
  List,
  Toast,
  confirmAlert,
  showHUD,
  showToast,
} from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [answer, setAnswer] = useState("not asked yet");
  return (
    <List navigationTitle="Feedback">
      <List.Item
        title="Show a Toast"
        subtitle="With a button of its own"
        actions={
          <ActionPanel>
            <Action
              title="Show Toast"
              onAction={() =>
                void showToast({
                  style: Toast.Style.Success,
                  title: "Saved",
                  message: "Toasts report progress",
                  primaryAction: { title: "Undo", onAction: () => void showHUD("Undone") },
                })
              }
            />
          </ActionPanel>
        }
      />
      <List.Item
        title="Show a HUD"
        subtitle="A short confirmation"
        actions={
          <ActionPanel>
            <Action title="Show HUD" onAction={() => void showHUD("Done")} />
          </ActionPanel>
        }
      />
      <List.Item
        title="Ask a Question"
        subtitle={`Answer: ${answer}`}
        actions={
          <ActionPanel>
            <Action
              title="Ask"
              onAction={async () => {
                const yes = await confirmAlert({
                  title: "Delete the sample?",
                  message: "Nothing is really deleted.",
                  primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
                });
                setAnswer(yes ? "delete" : "keep");
              }}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
