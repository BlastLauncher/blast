import { destructive } from "./tmux.ts";

export default async function Command() {
  await destructive("kill-session");
}
