import {
  Action,
  ActionPanel,
  OpenAction,
  PasteAction,
  Form,
  ImageMask,
  List,
  PushAction,
  SubmitFormAction,
  clearLocalStorage,
  copyTextToClipboard,
  getLocalStorageItem,
  pasteText,
  removeLocalStorageItem,
  setLocalStorageItem,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";

function PushedView() {
  const navigation = useNavigation();
  return (
    <List navigationTitle="Follow-up:Pushed">
      <List.Item
        title="Pushed"
        actions={<ActionPanel><Action title="Pop" onAction={navigation.pop} /></ActionPanel>}
      />
    </List>
  );
}

export default function Command() {
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    let active = true;
    void (async () => {
      const previous = await getLocalStorageItem("alias");
      await setLocalStorageItem("alias", "ready");
      if (active) {
        setStatus(`${previous ?? "none"}:ready`);
      }
    })().catch((error: unknown) => {
      if (active) {
        setStatus(`error:${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Form
      navigationTitle={`Follow-up:${status}`}
      actions={
        <ActionPanel>
          <SubmitFormAction
            title="Submit legacy"
            onSubmit={() => {
              void setLocalStorageItem("submitted", "yes");
            }}
          />
          <OpenAction
            title="Open legacy"
            target="https://example.com/followup"
            onOpen={() => {
              void setLocalStorageItem("opened", "yes");
            }}
          />
          <PasteAction
            title="Paste legacy"
            content="legacy paste"
            onPaste={() => {
              void setLocalStorageItem("pasted", "yes");
            }}
          />
          <Action
            title="Copy helper"
            onAction={() => {
              void copyTextToClipboard("helper copy");
            }}
          />
          <Action
            title="Paste helper"
            onAction={() => {
              void pasteText("helper paste");
            }}
          />
          <Action
            title="Remove legacy"
            onAction={() => {
              void removeLocalStorageItem("helper");
            }}
          />
          <Action
            title="Clear legacy"
            onAction={() => {
              void clearLocalStorage();
            }}
          />
          <PushAction
            title="Push legacy"
            target={<PushedView />}
            onPush={() => {
              void setLocalStorageItem("pushed", "yes");
            }}
            onPop={() => {
              void setLocalStorageItem("popped", "yes");
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="choice" title="Choice" defaultValue="one">
        <Form.Dropdown.Item value="one" title="One" icon={{ source: "option.png", mask: ImageMask.Circle }} />
      </Form.Dropdown>
    </Form>
  );
}
