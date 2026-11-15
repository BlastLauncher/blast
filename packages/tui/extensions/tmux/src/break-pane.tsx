import { sessionTarget, target, tmux } from "./tmux.ts";

export default async function Command() {
  // `-t` names the destination for break-pane; the pane to move is `-s`.
  await tmux(["break-pane", "-s", target(), "-t", `${sessionTarget()}:`]);
}
