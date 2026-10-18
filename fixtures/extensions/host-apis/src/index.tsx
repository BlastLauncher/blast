import {
  Action,
  ActionPanel,
  Clipboard,
  getApplications,
  List,
  openCommandPreferences,
  openExtensionPreferences,
} from "@raycast/api";
import { useState } from "react";

// Drives the host-backed capabilities from actions so a script can decide when
// each request happens; the scene then shows the host's answer, or the denial.
export default function Command() {
  const [lines, setLines] = useState<string[]>([]);
  const report = async (line: () => Promise<string>) => {
    try {
      setLines([...lines, await line()]);
    } catch (error) {
      setLines([...lines, `failed ${(error as Error).message}`]);
    }
  };
  return (
    <List navigationTitle={`host-apis ${lines.join(" ")}`}>
      <List.Item
        title="Host APIs"
        actions={
          <ActionPanel>
            <Action
              title="Applications"
              onAction={() =>
                report(async () => {
                  const applications = await getApplications();
                  return `applications ${applications.map((item) => item.name).join(",")}`;
                })
              }
            />
            <Action
              title="Applications For Path"
              onAction={() =>
                report(async () => {
                  const applications = await getApplications("/tmp/report.txt");
                  return `path applications ${applications.length}`;
                })
              }
            />
            <Action
              title="Read"
              onAction={() =>
                report(async () => {
                  const content = await Clipboard.read();
                  return `read ${content.text} ${content.file ?? "no-file"} ${content.html ?? "no-html"}`;
                })
              }
            />
            <Action
              title="Read Text"
              onAction={() =>
                report(async () => {
                  const text = await Clipboard.readText();
                  return `text ${text ?? "none"}`;
                })
              }
            />
            <Action
              title="Read History"
              onAction={() =>
                report(async () => {
                  const text = await Clipboard.readText({ offset: 1 });
                  return `history ${text ?? "none"}`;
                })
              }
            />
            <Action
              title="Paste"
              onAction={() =>
                report(async () => {
                  await Clipboard.paste("pasted");
                  return "pasted";
                })
              }
            />
            <Action
              title="Clear"
              onAction={() =>
                report(async () => {
                  await Clipboard.clear();
                  return "cleared";
                })
              }
            />
            <Action
              title="Open Extension Preferences"
              onAction={() =>
                report(async () => {
                  await openExtensionPreferences();
                  return "extension preferences";
                })
              }
            />
            <Action
              title="Open Command Preferences"
              onAction={() =>
                report(async () => {
                  await openCommandPreferences();
                  return "command preferences";
                })
              }
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
