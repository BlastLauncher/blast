import { createElement as h, useState, useEffect } from "react";
import { MenuBarExtra } from "@raycast/api";

export default function Command() {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Ready");
  const [hidden, setHidden] = useState(false);
  useEffect(() => () => console.log("menu unmounted"), []);
  if (hidden) return null;
  return h(
    MenuBarExtra,
    { title, isLoading: loading },
    h(MenuBarExtra.Item, {
      title: "Click",
      onAction: (event) => {
        setTitle(event.type);
        setLoading(false);
      },
    }),
    h(MenuBarExtra.Item, { title: "Hide", onAction: () => setHidden(true) }),
  );
}
