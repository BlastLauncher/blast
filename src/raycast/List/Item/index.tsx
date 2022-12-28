import { List } from "@raycast/api";

import { ComponentTypes } from "../../types";

export const Item = (props: List.Item.Props) => {
  return <ComponentTypes.ListItem {...props} />;
};
