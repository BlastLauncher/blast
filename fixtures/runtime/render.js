import { List, render } from "@raycast/api";
import { jsx } from "react/jsx-runtime";

// A legacy command: no default export, it mounts its own root element.
render(jsx(List, { navigationTitle: "legacy render", children: null }));
