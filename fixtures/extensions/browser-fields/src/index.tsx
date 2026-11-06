import { Action, ActionPanel, Form } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [result, setResult] = useState<string>();
  const [tags, setTags] = useState(["a"]);
  return (
    <Form
      // Before submit the title mirrors the tags, so the browser test can wait for them.
      navigationTitle={result ?? `Tags: ${tags.join("+")}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            onSubmit={(values) => setResult(`Submitted: ${JSON.stringify(values)}`)}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="About" text="One of each field kind" />
      <Form.TextArea id="notes" title="Notes" />
      <Form.Separator />
      <Form.PasswordField id="secret" title="Secret" />
      <Form.Dropdown id="color" title="Color" defaultValue="red">
        <Form.Dropdown.Item value="red" title="Red" />
        <Form.Dropdown.Item value="green" title="Green" />
        <Form.Dropdown.Item value="blue" title="Blue" />
      </Form.Dropdown>
      <Form.DatePicker id="when" title="When" type={Form.DatePicker.Type.Date} />
      <Form.TagPicker id="tags" title="Tags" value={tags} onChange={setTags}>
        <Form.TagPicker.Item value="a" title="Alpha" />
        <Form.TagPicker.Item value="b" title="Beta" />
        <Form.TagPicker.Item value="c" title="Gamma" />
      </Form.TagPicker>
      <Form.FilePicker id="files" title="Files" />
    </Form>
  );
}
