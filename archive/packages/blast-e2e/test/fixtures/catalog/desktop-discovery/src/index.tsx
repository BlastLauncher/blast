import { Action, ActionPanel, List, getApplications, getSelectedText, openCommandPreferences } from "@raycast/api";
import { useEffect, useState } from "react";

export default function Command() {
  const [result, setResult] = useState({ selectedText: "pending", applications: [] });
  useEffect(() => {
    let active = true;
    void (async () => {
      const selectedText = await getSelectedText();
      const applications = await getApplications("/tmp/example.txt");
      await openCommandPreferences();
      if (active) {
        setResult({ selectedText, applications });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <List navigationTitle={`Discovery:${result.selectedText}`}>
      {result.applications.length === 0 ? (
        <List.Item title="Loading" />
      ) : (
        result.applications.map((application) => (
        <List.Item
          key={application.bundleId ?? application.path}
          title={application.name}
          subtitle={application.localizedName}
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
