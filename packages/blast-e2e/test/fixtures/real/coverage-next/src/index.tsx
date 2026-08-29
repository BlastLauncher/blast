import {
  Action,
  ActionPanel,
  CopyToClipboardAction,
  List,
  OpenInBrowserAction,
  captureException,
  getDefaultApplication,
  getPreferenceValues,
} from "@raycast/api";
import type { PreferenceValues } from "@raycast/api";
import { useEffect, useState } from "react";

export default function Command() {
  const preferenceCount = Object.keys(getPreferenceValues<PreferenceValues>()).length;
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    let active = true;
    void (async () => {
      const application = await getDefaultApplication("/tmp/fixture.txt");
      captureException(new Error("coverage fixture telemetry"));
      if (active) {
        setStatus(`${application.name}:${preferenceCount}`);
      }
    })().catch((error: unknown) => {
      captureException(error);
      if (active) {
        setStatus(`error:${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <List navigationTitle={`Next:${status}`}>
      <List.Item
        title="Coverage next"
        actions={
          <ActionPanel>
            <OpenInBrowserAction url="https://example.com/legacy" />
            <Action.OpenInBrowser title="Open modern" url="https://example.com/modern" />
            <CopyToClipboardAction content="next value" />
            <Action.CopyToClipboard title="Copy modern" content="modern value" />
          </ActionPanel>
        }
      />
    </List>
  );
}
