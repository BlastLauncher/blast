import path from "path";

import { Configuration } from "webpack";

import { rules } from "./webpack.rules";

const modulePath = path.resolve(__dirname, "blast_runtime/utility_process");

export const utilityConfig: Configuration = {
  entry: require.resolve('@blastlauncher/runtime/dist/run.js'), // Change to your own entry point
  target: "node",
  module: {
    rules,
  },
  output: {
    path: modulePath,
    filename: "index.js",
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
  },
  // TODO: find a way to infer this based on whether we run electron-forge start
  // or package.
  mode: "development",
};
