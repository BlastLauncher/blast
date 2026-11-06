import { List, LocalStorage } from "@raycast/api";
import { useEffect, useState } from "react";

export default function Command() {
  const [stored, setStored] = useState("loading…");
  useEffect(() => {
    void (async () => {
      if ((await LocalStorage.getItem("browser-demo")) === undefined)
        await LocalStorage.setItem("browser-demo", "persists");
      setStored(String((await LocalStorage.getItem("browser-demo")) ?? "missing"));
    })();
  }, []);
  return (
    <List navigationTitle="Browser storage">
      <List.Item title={`Storage: ${stored}`} />
    </List>
  );
}
