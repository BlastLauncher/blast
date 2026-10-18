import type { ModuleOptions } from "webpack";

// NOTE: the native-module rules below must stay out of sandboxed preload
// bundles (see webpack.preload.config.ts). Native modules cannot load in the
// sandbox anyway.
//
// NOTE: @vercel/webpack-asset-relocator-loader is pinned to 1.7.3 (no caret).
// Newer versions inject their `__dirname`-dependent startup runtime via a
// webpack RuntimeModule, which silently bypasses Electron Forge's
// AssetRelocatorPatch (it only intercepts the legacy mainTemplate hook).
// The unpatched runtime throws `ReferenceError: __dirname is not defined` in
// sandboxed preloads and renderers without Node integration. Do not upgrade
// past 1.7.x without verifying the Forge patch still applies.
export const rules: Required<ModuleOptions>["rules"] = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: "node-loader",
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: "@vercel/webpack-asset-relocator-loader",
      options: {
        outputAssetBase: "native_modules",
      },
    },
  },
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
];
