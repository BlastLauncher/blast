import { Action, ActionPanel, Form } from "@raycast/api";
import { Fragment } from "react";

function SaveActions() {
  return (
    <>
      <Action title="Save" />
    </>
  );
}

function RoleOptions() {
  return (
    <>
      <Form.Dropdown.Item value="admin" title="Administrator" />
      <Form.Dropdown.Item value="user" title="User" />
    </>
  );
}

function Fields() {
  return (
    <Fragment>
      <Form.TextField id="name" title="Name" defaultValue="Ada" />
      <Form.Dropdown id="role" title="Role" defaultValue="admin">
        <RoleOptions />
      </Form.Dropdown>
    </Fragment>
  );
}

export default function Command() {
  return (
    <Form actions={<ActionPanel><SaveActions /></ActionPanel>}>
      <Fields />
    </Form>
  );
}
