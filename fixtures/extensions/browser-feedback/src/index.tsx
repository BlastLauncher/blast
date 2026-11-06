import { Action, ActionPanel, List, Toast, confirmAlert, showHUD, showToast } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [answers, setAnswers] = useState<boolean[]>([]);
  async function ask() {
    const answer = await confirmAlert({ title: "Continue?", message: "Pick an answer" });
    setAnswers((previous) => [...previous, answer]);
  }
  return (
    <List>
      <List.Item
        title={`Answers: ${answers.length ? answers.join(",") : "none"}`}
        subtitle="Ask"
        actions={
          <ActionPanel>
            <Action title="Ask" onAction={ask} />
          </ActionPanel>
        }
      />
      <List.Item
        title="Toast"
        actions={
          <ActionPanel>
            <Action
              title="Show toast"
              onAction={() =>
                void showToast({
                  style: Toast.Style.Success,
                  title: "Toast ready",
                  // The HUD title differs from the toast, so seeing it proves this ran.
                  primaryAction: { title: "Show HUD", onAction: () => void showHUD("From action") },
                })
              }
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
