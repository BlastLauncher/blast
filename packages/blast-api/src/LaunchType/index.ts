export type { Environment } from "raycast-original";

export enum LaunchType {
  /**
   * A regular launch through user interaction
   */
  UserInitiated = "userInitiated",
  /**
   * Scheduled through an interval and launched from background
   */
  Background = "background",
}

