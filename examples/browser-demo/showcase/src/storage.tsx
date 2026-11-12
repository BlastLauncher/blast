import { Action, ActionPanel, Icon, List, LocalStorage } from "@raycast/api";
import { useEffect, useState } from "react";

const KEY = "visits";

export default function Command() {
  const [visits, setVisits] = useState<number>();
  useEffect(() => {
    void (async () => {
      // Every launch adds one, so reopening the command shows the stored count grow.
      const next = Number((await LocalStorage.getItem<number>(KEY)) ?? 0) + 1;
      await LocalStorage.setItem(KEY, next);
      setVisits(next);
    })();
  }, []);
  return (
    <List navigationTitle="Storage" isLoading={visits === undefined}>
      {visits === undefined ? null : (
        <List.Item
          icon={Icon.HardDrive}
          title={`Opened ${visits} ${visits === 1 ? "time" : "times"}`}
          subtitle="Go back and open Storage again"
          actions={
            <ActionPanel>
              <Action
                title="Reset Counter"
                onAction={async () => {
                  await LocalStorage.removeItem(KEY);
                  setVisits(0);
                }}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
