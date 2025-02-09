import { Action, ActionPanel, List, useNavigation } from "@raycast/api";

import { ErrorBoundary } from "@blastlauncher/api";
import { usePromise } from "@raycast/utils";
import { Component } from "react";

import { StoreCommand } from "../Store";

import { loadCommands } from "./loadCommands";
import { evalCommandModule } from "./utils";

class MyErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorBoundary error={this.state.error} />
    }

    return this.props.children;
  }
}

export const CommandList = () => {
  const { isLoading, data: commands = [], mutate } = usePromise(loadCommands);
  const { push } = useNavigation();

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search for apps and commands...">
      {commands.map((command, index) => {
        return (
          <List.Item
            key={`${command.title}-${index}`}
            title={command.title}
            subtitle={command.subtitle}
            actions={
              <ActionPanel>
                <Action
                  title="Open Command"
                  onAction={() => {
                    try {
                      const Comp = evalCommandModule(command.requirePath);
                      push(
                        <MyErrorBoundary>
                          <Comp />
                        </MyErrorBoundary>
                      );
                    } catch (error) {
                      console.error(error);
                    }
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
            <Action.Push title="Open Store" target={<StoreCommand refresh={mutate} />} />
          </ActionPanel>
        }
      />
    </List>
  );
};
