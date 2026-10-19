import { Action, ActionPanel, Form, type LaunchProps } from "@raycast/api";
import { useState } from "react";

export default function Command({ draftValues }: LaunchProps) {
  const [title, setTitle] = useState(
    `launch:${draftValues?.draft ?? "none"}:${draftValues?.date instanceof Date}`,
  );
  const [controlled, setControlled] = useState(draftValues?.controlled ?? "initial");
  return (
    <Form
      enableDrafts
      navigationTitle={title}
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={() => setTitle("submitted")} />
        </ActionPanel>
      }
    >
      <Form.TextField id="stored" storeValue defaultValue="default" />
      <Form.TextField id="draft" />
      <Form.TextField id="controlled" value={controlled} onChange={setControlled} />
      <Form.DatePicker id="date" />
      <Form.PasswordField id="password" storeValue />
    </Form>
  );
}
