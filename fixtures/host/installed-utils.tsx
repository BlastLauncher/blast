import { List } from "@raycast/api";
import { useCachedPromise, useFetch } from "@raycast/utils";

export default function Command() {
  const cached = useCachedPromise(async () => "cached promise resolved");
  const fetched = useFetch<{ title: string }>(
    'data:application/json,{"title":"fetch resolved offline"}',
  );
  return (
    <List isLoading={cached.isLoading || fetched.isLoading}>
      <List.Item title={cached.data ?? "pending promise"} />
      <List.Item title={fetched.data?.title ?? "pending fetch"} />
    </List>
  );
}
