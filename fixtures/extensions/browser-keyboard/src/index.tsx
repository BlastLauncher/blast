import { Action, ActionPanel, Detail, Form, List, Toast, showToast } from "@raycast/api";
import { useState } from "react";

const ITEMS = ["abc-special", ...Array.from({ length: 49 }, (_, index) => `item-${String(index + 1).padStart(2, "0")}`)];

function DetailView({ item }: { item: string }) {
  return (
    <Detail
      markdown={`# ${item}\n\nThis detail view was pushed from the long list.`}
      navigationTitle={`Detail: ${item}`}
    />
  );
}

function FormView() {
  const [result, setResult] = useState("Form ready");
  return (
    <Form
      navigationTitle={result}
    >
      <Form.TextField id="first" title="First" />
      <Form.TextField id="second" title="Second" />
      <Form.Checkbox id="enabled" label="Enabled" />
    </Form>
  );
}

export default function Command() {
  const [shortcutState, setShortcutState] = useState("Shortcut idle");
  const items = ITEMS;
  return (
    <List
      navigationTitle={shortcutState}
      actions={
        <ActionPanel>
          <Action
            title="Run Cmd Shift C"
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            onAction={() => setShortcutState("Shortcut ran")}
          />
          <Action.Push title="Open detail" target={<DetailView item={items[0] ?? "item"} />} />
          <Action.Push title="Open form" target={<FormView />} />
          <Action
            title="Show success toast"
            onAction={() => void showToast({ style: Toast.Style.Success, title: "Success toast" })}
          />
        </ActionPanel>
      }
    >
      {items.map((item) => (
        <List.Item
          key={item}
          title={item}
          actions={<ActionPanel>
            <Action.Push title="Open detail" target={<DetailView item={item} />} />
            <Action title="Run Cmd Shift C" shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} onAction={() => setShortcutState("Shortcut ran")} />
            <Action title="Show success toast" shortcut={{ modifiers: ["cmd", "shift"], key: "t" }} onAction={() => void showToast({ style: Toast.Style.Success, title: "Success toast" })} />
          </ActionPanel>}
        />
      ))}
    </List>
  );
}
