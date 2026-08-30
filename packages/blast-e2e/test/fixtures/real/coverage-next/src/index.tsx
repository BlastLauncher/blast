import {
  Action,
  ActionPanel,
  Color,
  CopyToClipboardAction,
  Icon,
  List,
  OpenInBrowserAction,
  captureException,
  environment,
  getDefaultApplication,
  getPreferenceValues,
  preferences,
  randomId,
} from "@raycast/api";
import type { Environment, FormValue, KeyEquivalent, Navigation, PreferenceValues, Preferences } from "@raycast/api";
import { useEffect, useState } from "react";

const legacyPreferenceValue = preferences.token?.value ?? "missing";
const fixtureId = randomId();

type CompatibilityTypeProbe = {
  environment: Environment;
  formValue: FormValue;
  keyEquivalent: KeyEquivalent;
  navigation: Navigation;
  preferences: Preferences;
};

const compatibilityTypeProbe: Partial<CompatibilityTypeProbe> = {};
void compatibilityTypeProbe;

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
    <List isShowingDetail navigationTitle={`Next:${status}`}>
      <List.Item
        title={{ value: "Coverage next", tooltip: "Measured detail fixture" }}
        subtitle={{
          value: `${legacyPreferenceValue}:${environment.extensionName}:${environment.ownerOrAuthorName}:${environment.appearance}:${fixtureId}`,
          tooltip: "State",
        }}
        detail={
          <List.Item.Detail
            markdown="# Coverage next"
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label
                  title="Status"
                  icon={Icon.CheckCircle}
                  text={{ value: status, color: Color.Green }}
                />
                <List.Item.Detail.Metadata.Label title="Progress" icon={Icon.CircleProgress} text="Measured" />
                <List.Item.Detail.Metadata.Label title="Collection" icon={Icon.AppWindowList} text="Detail" />
                <List.Item.Detail.Metadata.Separator />
                <List.Item.Detail.Metadata.Link
                  title="Documentation"
                  target="https://example.com/docs"
                  text="Open docs"
                />
              </List.Item.Detail.Metadata>
            }
          />
        }
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
