// A typing game in Raytyping's view shape: the search field is the game's
// input (controlled `searchText`), the selected item's detail shows progress,
// and the end of a round clears the field and shows metadata.
import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useEffect, useState } from "react";

const TEXT = "red fox jumps";

export default function Command() {
  const [typed, setTyped] = useState("");
  const [content, setContent] = useState(TEXT);
  const [rounds, setRounds] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (finished || typed.length === 0) return;
    let matched = 0;
    while (matched < typed.length && typed[matched] === TEXT[matched]) matched += 1;
    if (matched === TEXT.length) {
      setFinished(true);
      setRounds((value) => value + 1);
      setTyped("");
      setContent("Round complete, press **Enter** to reload");
      return;
    }
    setContent(matched ? `**${TEXT.slice(0, matched)}**${TEXT.slice(matched)}` : TEXT);
  }, [typed]);

  const reload = () => {
    setTyped("");
    setContent(TEXT);
    setFinished(false);
  };

  return (
    <List
      searchText={typed}
      isShowingDetail
      searchBarPlaceholder="Type here"
      onSearchTextChange={setTyped}
    >
      <List.Item
        icon={{
          source: Icon.Stopwatch,
          tintColor: TEXT.startsWith(typed) ? Color.Green : Color.Red,
        }}
        title={`${typed.length} typed`}
        actions={
          <ActionPanel>
            <Action title="Reload" onAction={reload} />
          </ActionPanel>
        }
        detail={
          <List.Item.Detail
            markdown={content}
            metadata={
              finished ? (
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label title="Rounds" text={String(rounds)} />
                </List.Item.Detail.Metadata>
              ) : null
            }
          />
        }
      />
    </List>
  );
}
