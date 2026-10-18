import {
  Action,
  ActionPanel,
  Form,
  getSelectedText,
  getSelectedFinderItems,
  getFrontmostApplication,
  showInFinder,
  trash,
} from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [result, setResult] = useState("Selection");
  async function run(read: () => Promise<unknown>) {
    try {
      setResult(JSON.stringify(await read()));
    } catch (error) {
      setResult(String(error));
    }
  }
  return (
    <Form
      navigationTitle={result}
      actions={
        <ActionPanel>
          <Action title="Text" onAction={() => run(getSelectedText)} />
          <Action title="Files" onAction={() => run(getSelectedFinderItems)} />
          <Action title="Frontmost" onAction={() => run(getFrontmostApplication)} />
          <Action
            title="Reveal"
            onAction={() =>
              run(async () => {
                await showInFinder("/tmp/a");
                return "revealed";
              })
            }
          />
          <Action
            title="Trash"
            onAction={() =>
              run(async () => {
                await trash(["/tmp/a", "/tmp/b"]);
                return "trashed";
              })
            }
          />
          <Action.SubmitForm onSubmit={(values) => setResult(JSON.stringify(values))} />
        </ActionPanel>
      }
    >
      <Form.FilePicker id="files" />
    </Form>
  );
}
