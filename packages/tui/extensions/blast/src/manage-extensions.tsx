import { useEffect, useState } from "react";
import { Action, ActionPanel, Alert, confirmAlert, Icon, List, showHUD } from "@raycast/api";
import { rm } from "node:fs/promises";
import { loadConfig, saveConfig, type BlastConfig } from "./config.ts";

export default function ManageExtensions() {
  const [config, setConfig] = useState<BlastConfig>();
  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);
  if (!config) return <List isLoading />;
  const update = async (next: BlastConfig, message: string) => {
    await saveConfig(next);
    setConfig(next);
    await showHUD(message);
  };
  return (
    <List navigationTitle="Manage Blast Extensions">
      <List.Item
        id="builtin-tmux"
        title="Builtin tmux commands"
        subtitle={config.builtinTmux ? "Enabled" : "Disabled"}
        icon={Icon.Terminal}
        actions={
          <ActionPanel>
            <Action
              title={config.builtinTmux ? "Disable" : "Enable"}
              icon={config.builtinTmux ? Icon.XMarkCircle : Icon.CheckCircle}
              onAction={() =>
                update(
                  { ...config, builtinTmux: !config.builtinTmux },
                  config.builtinTmux ? "Builtin tmux disabled" : "Builtin tmux enabled",
                )
              }
            />
          </ActionPanel>
        }
      />
      {config.extensions.map((extension) => (
        <List.Item
          key={extension.id}
          title={extension.title}
          subtitle={extension.enabled ? "Enabled" : "Disabled"}
          accessories={[{ text: extension.id }]}
          actions={
            <ActionPanel>
              <Action
                title={extension.enabled ? "Disable" : "Enable"}
                icon={extension.enabled ? Icon.XMarkCircle : Icon.CheckCircle}
                onAction={() =>
                  update(
                    {
                      ...config,
                      extensions: config.extensions.map((item) =>
                        item.id === extension.id ? { ...item, enabled: !item.enabled } : item,
                      ),
                    },
                    extension.enabled
                      ? `Disabled ${extension.title}`
                      : `Enabled ${extension.title}`,
                  )
                }
              />
              <Action
                title="Remove Extension"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={async () => {
                  if (
                    !(await confirmAlert({
                      title: `Remove ${extension.title}?`,
                      message: "The downloaded extension will be deleted.",
                      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
                    }))
                  )
                    return;
                  await rm(extension.directory, { recursive: true, force: true });
                  await update(
                    {
                      ...config,
                      extensions: config.extensions.filter((item) => item.id !== extension.id),
                    },
                    `Removed ${extension.title}`,
                  );
                }}
              />
            </ActionPanel>
          }
        />
      ))}
      {!config.extensions.length ? <List.EmptyView title="No installed extensions" /> : null}
    </List>
  );
}
