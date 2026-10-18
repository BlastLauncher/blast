import { Action, ActionPanel, List, getFrontmostApplication, getSelectedFinderItems, showInFinder } from "@raycast/api";
import { useEffect, useState } from "react";

export default function Command() {
  const [result, setResult] = useState({ applicationName: "pending", items: [] });
  useEffect(() => {
    let active = true;
    void (async () => {
      const items = await getSelectedFinderItems();
      const application = await getFrontmostApplication();
      await showInFinder(items[0]?.path ?? "/tmp/example.txt");
      if (active) {
        setResult({ applicationName: application.name, items });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <List navigationTitle={`Finder:${result.applicationName}`}>
      {result.items.length === 0 ? (
        <List.Item title="Loading" />
      ) : (
        result.items.map((item) => (
          <List.Item
            key={item.path}
            title={item.path}
            actions={
              <ActionPanel>
                <Action title="Open" />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
