import { selectRelativePane } from "./tmux.ts";

export default async function Command() {
  await selectRelativePane(1);
}
