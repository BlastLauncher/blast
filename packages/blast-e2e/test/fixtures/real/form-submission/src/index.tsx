import { Action, ActionPanel, Form } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [submitted, setSubmitted] = useState<string | undefined>();

  return (
    <Form
      navigationTitle="Profile"
      actions={
        <ActionPanel title="Profile actions">
          <ActionPanel.Section title="Submit">
            <Action.SubmitForm
              title="Save profile"
              onSubmit={(values) => {
                setSubmitted(`${String(values.name)}|${String(values.enabled)}|${String(values.role)}`);
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue="Ada" />
      <Form.TextArea id="bio" title="Bio" placeholder="About you" />
      <Form.Checkbox id="enabled" label="Enabled" defaultValue={true} />
      <Form.Dropdown id="role" title="Role" defaultValue="admin">
        <Form.Dropdown.Section title="Roles">
          <Form.Dropdown.Item value="admin" title="Administrator" />
          <Form.Dropdown.Item value="user" title="User" />
        </Form.Dropdown.Section>
      </Form.Dropdown>
      {submitted === undefined ? (
        <Form.Separator />
      ) : (
        <Form.Description title="Submitted" text={submitted} />
      )}
    </Form>
  );
}
