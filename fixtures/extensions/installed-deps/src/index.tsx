import { List } from "@raycast/api";
import { title } from "blast-offline-dep";
export default function Command() {
  return (
    <List>
      <List.Item title={title} />
    </List>
  );
}
