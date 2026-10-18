import { Action, ActionPanel, Form } from "@raycast/api";
import { useState } from "react";

// The secret command: the submitted password is summarized as `<set>`/`<unset>`,
// so the extension itself never publishes the secret into the scene either.
export default function Command() {
  const [result, setResult] = useState("Fill secret form");
  const [tags, setTags] = useState<string[]>([]);
  return (
    <Form
      navigationTitle={result}
      searchBarAccessory={<Form.LinkAccessory target="https://www.raycast.com" text="Docs" />}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            onSubmit={(values) =>
              setResult(
                JSON.stringify({ ...values, password: values.password ? "<set>" : "<unset>" }),
              )
            }
          />
        </ActionPanel>
      }
    >
      <Form.TagPicker id="tags" value={tags} onChange={setTags} placeholder="Add tag">
        <Form.TagPicker.Item value="red" title="Red" />
        <Form.TagPicker.Item value="green" title="Green" />
      </Form.TagPicker>
      <Form.PasswordField id="password" placeholder="Password" />
    </Form>
  );
}
