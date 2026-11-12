import { Action, ActionPanel, Form, Toast, showToast } from "@raycast/api";
import { useState } from "react";

type Values = { name: string; topics: string[] };

export default function Command() {
  const [nameError, setNameError] = useState<string>();
  async function submit(values: Values) {
    if (!values.name.trim()) {
      setNameError("Name is required");
      return;
    }
    await showToast({
      style: Toast.Style.Success,
      title: `Thanks, ${values.name.trim()}!`,
      message: `${values.topics.length} topic(s) picked`,
    });
  }
  return (
    <Form
      navigationTitle="Form"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Try it" text="Submit with ⌘↵. Leave Name empty to see validation." />
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Ada"
        {...(nameError ? { error: nameError } : {})}
        onChange={() => setNameError(undefined)}
      />
      <Form.PasswordField id="secret" title="Secret" placeholder="Never leaves this tab" />
      <Form.TextArea id="notes" title="Notes" placeholder="A few lines…" />
      <Form.Separator />
      <Form.Checkbox id="subscribe" title="Updates" label="Send me updates" defaultValue={false} />
      <Form.Dropdown id="flavor" title="Flavor" defaultValue="mint">
        <Form.Dropdown.Item value="mint" title="Mint" />
        <Form.Dropdown.Item value="mango" title="Mango" />
        <Form.Dropdown.Item value="cocoa" title="Cocoa" />
      </Form.Dropdown>
      <Form.DatePicker id="when" title="When" type={Form.DatePicker.Type.Date} />
      <Form.TagPicker id="topics" title="Topics" defaultValue={["lists"]}>
        <Form.TagPicker.Item value="lists" title="Lists" />
        <Form.TagPicker.Item value="forms" title="Forms" />
        <Form.TagPicker.Item value="grids" title="Grids" />
      </Form.TagPicker>
    </Form>
  );
}
