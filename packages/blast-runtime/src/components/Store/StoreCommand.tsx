import { List } from "@raycast/api";

import { usePromise } from "@raycast/utils";
import { useCallback, useState } from "react";

import { loadInstalledExtensions } from "../CommandList/loadCommands";

import { searchExtensions } from "./api";
import type { SearchResult } from './npmClient'

export function StoreCommand() {
  const [search, setSearch] = useState("");
  const { isLoading: isInstalledLoading, data: installedExtensions } = usePromise(loadInstalledExtensions);
  const { isLoading, data: extensions = [] } = usePromise((s) => searchExtensions(s), [search], {
    execute: !isInstalledLoading && typeof installedExtensions !== "undefined",
  });

  const isInstalled = useCallback(
    (extension: SearchResult['objects'][number]['package']) => installedExtensions?.find((ext) => ext === extension.name),
    [installedExtensions]
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search for apps and commands..."
      searchText={search}
      onSearchTextChange={(value) => setSearch(value)}
    >
      {extensions.map((extension) => {
        const isInstalledExtension = isInstalled(extension);
        const isInstalledText = isInstalledExtension ? "Installed" : "Not Installed";
        return <List.Item key={extension.name} title={`${extension.name} ${isInstalledText}`} />;
      })}
    </List>
  );
}
