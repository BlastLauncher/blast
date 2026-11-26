import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
} from "@raycast/api";
import {
  listInstalledPlugins,
  removeStaleGitLock,
  resolvePluginsDir,
  runTpmScript,
  type InstalledTpmPlugin,
  type TpmScript,
} from "./tpm.ts";

function pluginSubtitle(plugin: InstalledTpmPlugin): string {
  if (plugin.branch && plugin.commit) return `${plugin.branch} · ${plugin.commit}`;
  if (plugin.commit) return plugin.commit;
  return "Not a git repository";
}

export default function ManageTpmPlugins() {
  const [pluginsDir, setPluginsDir] = useState<string>();
  const [plugins, setPlugins] = useState<InstalledTpmPlugin[]>();
  const [busy, setBusy] = useState(false);

  const reload = async (dir?: string) => {
    const resolved = dir ?? pluginsDir ?? (await resolvePluginsDir());
    setPluginsDir(resolved);
    if (!resolved) {
      setPlugins([]);
      return;
    }
    setPlugins(await listInstalledPlugins(resolved));
  };

  useEffect(() => {
    void reload();
  }, []);

  const runAction = async (
    label: string,
    script: TpmScript,
    args: string[] = [],
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: `${label}…` });
    try {
      const result = await runTpmScript(script, args, pluginsDir);
      toast.style = result.ok ? Toast.Style.Success : Toast.Style.Failure;
      toast.title = result.ok ? label : `${label} failed`;
      toast.message = result.summary;
      await reload(pluginsDir);
    } finally {
      setBusy(false);
    }
  };

  const clearLock = async (plugin: InstalledTpmPlugin): Promise<void> => {
    if (busy || !plugin.lockPath) return;
    setBusy(true);
    try {
      await removeStaleGitLock(plugin.lockPath);
      await showToast({
        style: Toast.Style.Success,
        title: `Removed stale lock for ${plugin.name}`,
      });
      await reload(pluginsDir);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Could not remove lock for ${plugin.name}`,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const cleanUnused = async (): Promise<void> => {
    const confirmed = await confirmAlert({
      title: "Clean unused TPM plugins?",
      message: "Plugins not declared in your tmux configuration will be removed from disk.",
      primaryAction: { title: "Clean Plugins", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;
    await runAction("Clean unused plugins", "clean_plugins");
  };

  return (
    <List
      isLoading={plugins === undefined || busy}
      navigationTitle="Manage TPM Plugins"
      searchBarPlaceholder="Filter TPM plugins…"
    >
      {plugins?.length === 0 ? (
        <List.EmptyView
          title={pluginsDir ? "No TPM plugins found" : "TPM is not installed"}
          description={
            pluginsDir
              ? `Plugins directory: ${pluginsDir}`
              : "Install Tmux Plugin Manager under ~/.tmux/plugins/tpm"
          }
        />
      ) : (
        <List.Section title={pluginsDir ?? "TPM Plugins"} subtitle={`${plugins?.length ?? 0}`}>
          {(plugins ?? []).map((plugin) => (
            <List.Item
              key={plugin.name}
              title={plugin.name}
              subtitle={pluginSubtitle(plugin)}
              icon={
                plugin.lockPath
                  ? { source: Icon.ExclamationMark, tintColor: Color.Orange }
                  : { source: Icon.Plug, tintColor: Color.Green }
              }
              accessories={[
                plugin.lockPath
                  ? { tag: { value: "Stale index.lock", color: Color.Orange } }
                  : { text: "Installed" },
              ]}
              actions={
                <ActionPanel>
                  {plugin.lockPath ? (
                    <Action
                      title="Remove Stale Git Lock"
                      icon={Icon.Trash}
                      onAction={() => void clearLock(plugin)}
                    />
                  ) : null}
                  <Action
                    title={`Update ${plugin.name}`}
                    icon={Icon.ArrowClockwise}
                    onAction={() =>
                      void runAction(`Update ${plugin.name}`, "update_plugins", [plugin.name])
                    }
                  />
                  <Action
                    title="Update All Plugins"
                    icon={Icon.Download}
                    onAction={() => void runAction("Update all plugins", "update_plugins", ["all"])}
                  />
                  <Action
                    title="Install Missing Plugins"
                    icon={Icon.Plus}
                    onAction={() => void runAction("Install plugins", "install_plugins")}
                  />
                  <Action
                    title="Clean Unused Plugins"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => void cleanUnused()}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
