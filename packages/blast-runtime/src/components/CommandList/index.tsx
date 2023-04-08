import { ActionPanel, List, Action, useNavigation } from "@raycast/api";

import { usePromise } from "@raycast/utils";

import { StoreCommand } from "../Store";

import { loadCommands } from "./loadCommands";
import { evalCommandModule } from "./utils";

export const CommandList = () => {
  const { isLoading, data: commands = [] } = usePromise(loadCommands);
  const { push } = useNavigation();

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search for apps and commands...">
      {commands.map((command) => {
        return (
          <List.Item
            key={command.name}
            title={command.title}
            subtitle={command.subtitle}
            actions={
              <ActionPanel>
                <Action
                  title="Open Command"
                  onAction={() => {
                    const Comp = evalCommandModule(command.requirePath);
                    push(<Comp />);
                  }}
                />
              </ActionPanel>
            }
          />
        );
      })}

      <List.Item
        key="store"
        title="Store"
        actions={
          <ActionPanel>
            <Action.Push title="Open Store" target={<StoreCommand />} />
          </ActionPanel>
        }
      />
    </List>
  );
};
