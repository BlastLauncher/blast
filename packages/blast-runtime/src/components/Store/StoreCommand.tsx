import { List, ActionPanel, Action } from "@raycast/api";
import cp from "child_process";
import os from "os";

import { usePromise } from "@raycast/utils";
import { useCallback, useState } from "react";

import { loadInstalledExtensions } from "../CommandList/loadCommands";

import { searchExtensions } from "./api";
import type { SearchResult } from "./npmClient";

// npm install --prefix ~/.blast/extensions @blast-extensions/todo-list@0.0.2
const installExtension = async (packageName: string) => {
  return new Promise((resolve, reject) => {
    const prefix = os.homedir() + "/.blast/extensions";
    const command = `npm install --prefix ${prefix} ${packageName}`;

    cp.exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
};

const uninstallExtension = async (packageName: string) => {
  return new Promise((resolve, reject) => {
    const prefix = os.homedir() + "/.blast/extensions";
    const command = `npm uninstall --prefix ${prefix} ${packageName}`;

    cp.exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
};

export function StoreCommand() {
  const [search, setSearch] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const {
    isLoading: isInstalledLoading,
    data: installedExtensions,
    mutate: mutateInstalledExtensions,
  } = usePromise(loadInstalledExtensions);
  const { isLoading, data: extensions = [] } = usePromise((s) => searchExtensions(s), [search], {
    execute: !isInstalledLoading && typeof installedExtensions !== "undefined",
  });

  const isInstalled = useCallback(
    (extension: SearchResult["objects"][number]["package"]) =>
      installedExtensions?.find((ext) => ext === extension.name),
    [installedExtensions]
  );

  const handleInstall = async (extension: SearchResult["objects"][number]["package"]) => {
    if (isInstalled(extension) || isInstalling) {
      return;
    }

    setIsInstalling(true);

    try {
      await installExtension(extension.name);
      mutateInstalledExtensions();
    } catch (error) {
      console.error(error);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async (extension: SearchResult["objects"][number]["package"]) => {
    if (!isInstalled(extension) || isUninstalling) {
      return;
    }

    setIsUninstalling(true);

    try {
      await uninstallExtension(extension.name);
      mutateInstalledExtensions();
    } catch (error) {
      console.error(error);
    } finally {
      setIsUninstalling(false);
    }
  };

  return (
    <List
      isLoading={isLoading || isInstalledLoading}
      searchBarPlaceholder="Search for apps and commands..."
      searchText={search}
      onSearchTextChange={(value) => setSearch(value)}
    >
      {extensions.map((extension) => {
        const isInstalledExtension = isInstalled(extension);
        const isInstalledText = isInstalledExtension ? "Installed" : "Not Installed";
        return (
          <List.Item
            key={extension.name}
            title={`${extension.name} ${isInstalledText}`}
            actions={
              <ActionPanel>
                {!isInstalledExtension && <Action title="Install" onAction={() => handleInstall(extension)} />}

                {isInstalledExtension && <Action title="Uninstall" onAction={() => handleUninstall(extension)} />}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
