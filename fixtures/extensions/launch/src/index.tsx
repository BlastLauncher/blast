import {
  Action,
  ActionPanel,
  closeMainWindow,
  Image,
  launchCommand,
  LaunchType,
  List,
  PopToRootType,
} from "@raycast/api";
import { useState } from "react";

// Shows the launch props it was started with, and drives the two module-level
// window commands from actions so a script decides when each happens.
type LaunchProps = {
  arguments: { query: string; option?: string };
  launchType: string;
};

export default function Command(props: LaunchProps) {
  const [status, setStatus] = useState("idle");
  const { query, option } = props.arguments;
  const report = async (work: () => Promise<string>) => {
    try {
      setStatus(await work());
    } catch (error) {
      setStatus(`failed ${(error as Error).message}`);
    }
  };
  return (
    <List navigationTitle={`launch ${query} ${option ?? "none"} ${props.launchType} ${status}`}>
      <List.Item
        title="Launched"
        icon={{ source: "avatar.png", mask: Image.Mask.Circle }}
        actions={
          <ActionPanel>
            <Action
              title="Launch"
              onAction={() =>
                report(async () => {
                  await launchCommand({
                    name: "index",
                    type: LaunchType.UserInitiated,
                    arguments: { query: "nested" },
                    context: { from: "launch" },
                  });
                  return "launched";
                })
              }
            />
            <Action
              title="Close"
              onAction={() =>
                report(async () => {
                  await closeMainWindow({
                    clearRootSearch: true,
                    popToRootType: PopToRootType.Immediate,
                  });
                  return "closed";
                })
              }
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
