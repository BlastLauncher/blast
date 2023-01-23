import { ActionPanel, List, Action } from "@raycast/api";
import os from "os";
import path from "path";

import { evalJSModule } from "./utils";

// TODO: gather all available commands from modules
const pkg = path.join(os.homedir(), ".blast/extensions/node_modules/@BlastLauncher/todo-list/index.js");

const TODOCommand = evalJSModule(pkg);

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
