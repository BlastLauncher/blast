import type { Configuration } from "webpack";

import { plugins } from "./webpack.plugins";
import { rules } from "./webpack.rules";

rules.push({
  test: /\.(scss|css)$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }, { loader: "postcss-loader" }, { loader: "sass-loader" }],
});

rules.push({
  test: /\.tsx?$/,
  use: "ts-loader",
  exclude: /node_modules/,
});

export const rendererConfig: Configuration = {
  devtool: "source-map",
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
  },
};
