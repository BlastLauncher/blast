import * as path from "path";

import * as webpack from "webpack";

const configs: webpack.Configuration[] = [
  {
    mode: "development",
    entry: {
      bundle: ["windowPolyfill", path.join(__dirname, "./src/examples/index.ts")],
      testClient: ["windowPolyfill", path.join(__dirname, "./src/testClient.ts")],
    },
    devtool: "source-map",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    target: "node",
    resolve: {
      alias: {
        "@raycast/api": path.join(__dirname, "./src/raycast/api.ts"),
        windowPolyfill: path.resolve(__dirname, "./src/utils/window.js"),
        "raycast-original": path.resolve(__dirname, "node_modules/@raycast/api"),
      },
      extensions: [".tsx", ".ts", ".js"],
      fallback: {
        util: false,
        os: false,
        path: false,
        buffer: false,
        assert: false,
        stream: false,
        https: false,
        http: false,
        url: false,
        crypto: false,
        zlib: false,
        fs: false,
      },
    },
  },
];

export default configs;
