import CopyWebpackPlugin from "copy-webpack-plugin";
import type { Configuration } from "webpack";

import { rules } from "./webpack.rules";

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: "./src/index.ts",
  // Put your normal webpack config below here
  module: {
    rules,
  },
  resolve: {
    // V2 packages intentionally publish their NodeNext ESM entrypoints. The
    // Electron main bundle is emitted as CommonJS, but webpack can bundle
    // those ESM modules directly when it selects the import condition.
    conditionNames: ["webpack", "import", "default"],
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "assets",
          to: "assets",
        },
      ],
    }),
  ],
};
