import { List } from "@raycast/api";
import { getAccessToken, withAccessToken } from "@raycast/utils";

function Command() {
  const { token } = getAccessToken();
  return (
    <List navigationTitle="with token">
      <List.Item title={`OAuth ${token}`} />
    </List>
  );
}

export default withAccessToken({
  authorize: () => new Promise<string>((resolve) => setTimeout(() => resolve("stub-token"), 20)),
})(Command);
