import { ActionPanel, List, Action } from "@raycast/api";
import os from "os";
import path from "path";

import { evalCommandModule } from "./utils";

// TODO: gather all available commands from modules
// Install with the following command
// npm install --prefix ~/.blast/extensions @BlastLauncher/todo-list@0.0.2
const pkg = path.join(os.homedir(), ".blast/extensions/node_modules/@BlastLauncher/todo-list/index.js");

const TODOCommand = evalCommandModule(pkg);

export const CommandList = () => {
  return (
    <List isLoading={false} searchBarPlaceholder="Search...">
      <List.Item
        title="Test item"
        actions={
          <ActionPanel>
            <Action.Push title="Open Command" target={<TODOCommand />} />
          </ActionPanel>
        }
      />
    </List>
  );
};
