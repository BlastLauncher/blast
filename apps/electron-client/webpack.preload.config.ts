import type { Configuration } from "webpack";

/**
 * Minimal webpack config for sandboxed preload scripts.
 *
 * Preloads run in Electron's sandbox where Node globals like `__dirname`
 * do not exist, so this config intentionally omits the native-module rules
 * (node-loader and @vercel/webpack-asset-relocator-loader) from
 * `webpack.rules.ts`. That loader emits a `__dirname`-dependent runtime that
 * crashes sandboxed preloads with `ReferenceError: __dirname is not defined`.
 * Native modules cannot load in the sandbox anyway; they are handled by the
 * main and renderer-window bundles instead.
 */
export const preloadConfig: Configuration = {
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /(node_modules|\.webpack)/,
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true,
          },
        },
      },
    ],
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx"],
  },
};
