import { targeted } from "./tmux.ts";

export default async function Command() {
  await targeted("swap-pane", ["-D"]);
}
