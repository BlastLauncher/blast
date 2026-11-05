/**
 * Browser bundling configuration shared by the prebuild and the in-browser
 * path. Both must resolve the same runtime modules to the same in-memory
 * files; keeping one list means a prebuilt bundle and a bundle the browser
 * builds on demand cannot disagree about what is external.
 */

/** Runtime modules supplied once and shared by every prebuilt command bundle. */
export const sharedModules = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@raycast/api",
  "react-reconciler",
  "scheduler",
  "@blastlauncher/protocol",
];

/** In-memory paths for the same runtime modules. */
export const aliases: Record<string, string> = {
  "@raycast/api": "/packages/runtime/src/api/index.ts",
  "@blastlauncher/protocol": "/packages/protocol/src/index.ts",
  react: "/node_modules/react/index.js",
  "react/jsx-runtime": "/node_modules/react/jsx-runtime.js",
  "react/jsx-dev-runtime": "/node_modules/react/jsx-dev-runtime.js",
  "react-reconciler": "/node_modules/react-reconciler/index.js",
  "react-reconciler/constants.js": "/node_modules/react-reconciler/constants.js",
  scheduler: "/node_modules/scheduler/index.js",
};
