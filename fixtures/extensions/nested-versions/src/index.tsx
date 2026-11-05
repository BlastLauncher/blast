import { List } from "@raycast/api";
import first from "first";
import second from "second";

export default function Command() {
  return (
    <List>
      <List.Item title={`${first} ${second}`} />
    </List>
  );
}
