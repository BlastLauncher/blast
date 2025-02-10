declare namespace JSX {
  import type { ActionPanel, Action, List, Detail, Form, Grid } from "raycast-original";

  type BlastNodeProps = {
    serializedKeys?: string[];
  };

  interface IntrinsicElements {
    ActionPanel: ActionPanel.Props & BlastNodeProps;
    ActionPanelSection: ActionPanel.Section.Props & BlastNodeProps;
    Action: Action.Props &
      BlastNodeProps & {
        actionEventName: string;
      };
    List: List.Props & BlastNodeProps;
    ListItem: List.Item.Props &
      BlastNodeProps & {
        children?: React.ReactNode;
      };
    EmptyView: List.EmptyView.Props &
      BlastNodeProps & {
        children?: React.ReactNode;
      };
    Detail: Detail.Props & BlastNodeProps;
    Form: Form.Props & BlastNodeProps;
    TextField: Form.TextField.Props &
      BlastNodeProps & {
        onChangeEventName: string;
      };

    NavigationRoot: {
      children?: React.ReactNode;
      stacksLength?: number;
    } & BlastNodeProps;

    Dropdown: List.Dropdown.Props & Grid.Dropdown.Props & Form.Dropdown.Props & BlastNodeProps;
  }
}
