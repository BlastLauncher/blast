declare namespace JSX {
  import type { ActionPanel, Action, List, Detail } from "raycast-original";

  type BlastNodeProps = {
    serializesKeys?: string[];
  };

  interface IntrinsicElements {
    ActionPanel: ActionPanel.Props & BlastNodeProps;
    Action: Action.Props &
      BlastNodeProps & {
        actionEventName: string;
      };
    List: List.Props & BlastNodeProps;
    EmptyView: List.EmptyView.Props & BlastNodeProps;
    Detail: Detail.Props & BlastNodeProps;
  }
}
