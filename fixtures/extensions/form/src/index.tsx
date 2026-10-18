import { Action, ActionPanel, Form } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [name, setName] = useState("");
  const [result, setResult] = useState("Fill form");
  return (
    <Form
      navigationTitle={result}
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={(values) => setResult(JSON.stringify(values))} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" value={name} onChange={setName} />
      <Form.TextArea id="notes" defaultValue="initial" />
      <Form.Dropdown id="drink">
        <Form.Dropdown.Item value="water" title="Water" />
        <Form.Dropdown.Item value="tea" title="Tea" />
      </Form.Dropdown>
      <Form.Checkbox id="agree" label="Agree" />
      <Form.DatePicker id="date" />
    </Form>
  );
}
