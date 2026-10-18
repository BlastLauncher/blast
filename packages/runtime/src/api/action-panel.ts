import { createElement, type ReactNode } from "react";

export interface ActionPanelProps {
  /** Sections or Actions. */
  children?: ReactNode;
  /** The title displayed at the top of the panel. */
  title?: string;
}

export interface ActionPanelSectionProps {
  /** Actions of the section. */
  children?: ReactNode;
  /** Title displayed above the section. */
  title?: string;
}

function ActionPanelSection(props: ActionPanelSectionProps) {
  return createElement("ActionPanel.Section", props);
}

export const ActionPanel = Object.assign(
  function ActionPanel(props: ActionPanelProps) {
    return createElement("ActionPanel", props);
  },
  { Section: ActionPanelSection },
);
