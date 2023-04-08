import { List } from "@raycast/api";

import { usePromise } from "@raycast/utils";
import { useState } from "react";

import { searchExtensions } from "./api";

export function StoreCommand() {
  const [search, setSearch] = useState("");
  const { isLoading, data: extensions = [] } = usePromise(() => searchExtensions(search));

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search for apps and commands..."
      searchText={search}
      onSearchTextChange={(value) => setSearch(value)}
    >
      {extensions.map((extension) => {
        return <List.Item key={extension.name} title={extension.name} />;
      })}
    </List>
  );
}
