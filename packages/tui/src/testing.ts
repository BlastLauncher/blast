// Test-renderer access for repo scripts (`corpus:tui-smoke`): they reach
// OpenTUI and the TUI's own React through this package, so the root workspace
// does not pin a second copy of either.
export { testRender } from "@opentui/react/test-utils";
export { act, createElement } from "react";
