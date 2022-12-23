import { IElement } from "./BaseElement";
import { Action, ActionPanel, EmptyView, List, View, Detail } from "./ExtendedElements";
import Command from "./Command";

export const elements: { [key: string]: IElement } = {
  View,
  ActionPanel,
  List,
  Command,
  EmptyView,
  Action,
  Detail,
};
