import { Action, ActionPanel, Form } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [submitted, setSubmitted] = useState<string | undefined>();
  const [lastEvent, setLastEvent] = useState("none");
  const recordEvent = (event: Form.Event<string>) => {
    setLastEvent(`${event.type}:${event.target.id}:${event.target.value ?? "none"}`);
  };

  return (
    <Form
      navigationTitle={`Profile:${lastEvent}`}
      actions={
        <ActionPanel title="Profile actions">
          <ActionPanel.Section title="Submit">
            <Action.SubmitForm
              title="Save profile"
              onSubmit={(values) => {
                const due = values.due instanceof Date ? values.due.toISOString().slice(0, 10) : "none";
                const tags = Array.isArray(values.tags) ? values.tags.join(",") : "none";
                const files = Array.isArray(values.files) ? values.files.join(",") : "none";
                setSubmitted(
                  `${String(values.name)}|${String(values.enabled)}|${String(values.role)}|${due}|${tags}|${files}`,
                );
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue="Ada" onFocus={recordEvent} onBlur={recordEvent} />
      <Form.TextArea id="bio" title="Bio" placeholder="About you" />
      <Form.Checkbox id="enabled" label="Enabled" defaultValue={true} />
      <Form.DatePicker
        id="due"
        title="Due"
        type={Form.DatePicker.Type.Date}
        defaultValue={new Date("2026-08-28T00:00:00.000Z")}
      />
      <Form.TagPicker id="tags" title="Tags" defaultValue={["v2"]}>
        <Form.TagPicker.Item value="v2" title="V2" />
        <Form.TagPicker.Item value="docs" title="Docs" />
      </Form.TagPicker>
      <Form.FilePicker id="files" title="Files" allowMultipleSelection={true} />
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
