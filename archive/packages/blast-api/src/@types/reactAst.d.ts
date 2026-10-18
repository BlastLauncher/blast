import type { ReactNode } from "react";
import type { ActionPanel, Action, List, Detail, Form } from "raycast-original";

type BlastNodeProps = {
  serializedKeys?: string[];
};

type DropdownNodeProps = BlastNodeProps & {
  onChangeEventName?: string;
  onSearchTextChangeEventName?: string;
  searchTextValue?: string;
};

declare module "react" {
  namespace JSX {
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
          children?: ReactNode;
        };
      EmptyView: List.EmptyView.Props &
        BlastNodeProps & {
          children?: ReactNode;
        };
      Detail: Detail.Props & BlastNodeProps;
      Form: Form.Props & BlastNodeProps;
      TextField: Form.TextField.Props &
        BlastNodeProps & {
          onChangeEventName: string;
        };

      NavigationRoot: {
        children?: ReactNode;
        stacksLength?: number;
      } & BlastNodeProps;

      Dropdown: List.Dropdown.Props & DropdownNodeProps;
      DropdownSection: List.Dropdown.Section.Props & BlastNodeProps;
      DropdownItem: List.Dropdown.Item.Props & BlastNodeProps;
    }
  }
}

export {};
