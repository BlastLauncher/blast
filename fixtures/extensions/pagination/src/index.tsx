import { Action, ActionPanel, Grid, List } from "@raycast/api";
import { useState } from "react";

export function PagedGrid() {
  const [page, setPage] = useState(1);
  return (
    <Grid
      navigationTitle={`grid page ${page}`}
      pagination={{ pageSize: 1, hasMore: page < 2, onLoadMore: () => setPage(page + 1) }}
    >
      <Grid.Item content="star.png" title={`grid item ${page}`} />
    </Grid>
  );
}

export default function Command() {
  const [page, setPage] = useState(1);
  return (
    <List
      navigationTitle={`list page ${page}`}
      pagination={{ pageSize: 1, hasMore: page < 2, onLoadMore: () => setPage(page + 1) }}
    >
      <List.Item
        title={`list item ${page}`}
        actions={
          <ActionPanel>
            <Action.Push title="Open Grid" target={<PagedGrid />} />
          </ActionPanel>
        }
      />
    </List>
  );
}
