import { List } from "@raycast/api";
import { baseUrlTitle } from "common/title";
import { aliasTitle } from "@lib/greeting";

export default function Command() {
  return (
    <List navigationTitle={`${baseUrlTitle()} ${aliasTitle()}`}>
      <List.Item title={baseUrlTitle()} />
      <List.Item title={aliasTitle()} />
    </List>
  );
}
