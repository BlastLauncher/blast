import { Action, ActionPanel, Form } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [result, setResult] = useState<string>();
  return (
    <Form
      // Before submit the title mirrors the name, so the browser test can wait for the echo.
      navigationTitle={result ?? `Name: ${name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            onSubmit={(values) => setResult(`Submitted: ${JSON.stringify(values)}`)}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" value={name} onChange={setName} />
      <Form.TextField id="notes" defaultValue="initial" />
      <Form.Checkbox id="agree" label="Agree" value={agree} onChange={setAgree} />
    </Form>
  );
}
