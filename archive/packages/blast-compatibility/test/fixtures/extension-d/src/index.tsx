import { Action, Detail, List } from "@raycast/api";
import { Detail as AliasedDetail } from "@raycast/api";
import * as Raycast from "@raycast/api";

export function ListCommand() {
  return (
    <List>
      <List.Item
        title="Example"
        detail={
          <List.Item.Detail
            metadata={
              <Detail.Metadata>
                <Detail.Metadata.TagList>
                  <Detail.Metadata.TagList.Item text="Stable" onAction={() => {}} />
                </Detail.Metadata.TagList>
              </Detail.Metadata>
            }
          />
        }
        actions={
          <ActionPanelShim>
            <Action.OpenWith path="/tmp/example.txt" />
          </ActionPanelShim>
        }
      />
    </List>
  );
}

export function AliasedCommand() {
  return <AliasedDetail markdown="# Aliased" />;
}

export function NamespaceCommand() {
  return <Raycast.Detail markdown="# Namespaced" />;
}

export async function readClipboard() {
  return Raycast.Clipboard.readText();
}

function ActionPanelShim({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
