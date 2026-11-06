import { Action, ActionPanel, Form } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [result, setResult] = useState("Fill form");
  return (
    <Form
      navigationTitle={result}
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
