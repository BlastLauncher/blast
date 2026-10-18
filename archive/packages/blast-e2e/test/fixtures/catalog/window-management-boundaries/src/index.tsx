import { Action, ActionPanel, List, WindowManagement, environment } from "@raycast/api";
import { useEffect, useState } from "react";

export default function Command() {
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    let active = true;
    void Promise.all([
      WindowManagement.getActiveWindow(),
      WindowManagement.getWindowsOnActiveDesktop(),
      WindowManagement.getDesktops(),
    ])
      .then(([activeWindow, windows, desktops]) => {
        if (active) {
          setStatus(
            `${activeWindow.id}:${windows.length}:${desktops.filter((desktop) => desktop.active).length}:${environment.canAccess(WindowManagement) ? "granted" : "denied"}`,
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus(`error:${error instanceof Error ? error.message : String(error)}`);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <List navigationTitle={`Window:${status}`}>
      <List.Item
        title="Window management"
        actions={
          <ActionPanel>
            <Action
              title="Move Window"
              onAction={async () => {
                await WindowManagement.setWindowBounds({
                  id: "window-1",
                  desktopId: "desktop-1",
                  bounds: {
                    position: { x: 100, y: 20 },
                    size: { width: 800, height: 600 },
                  },
                });
              }}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
