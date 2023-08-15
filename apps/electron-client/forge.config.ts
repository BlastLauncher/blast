import { spawnSync } from "child_process";
import path from "path";

import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import type { ForgeConfig } from "@electron-forge/shared-types";

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";

const config: ForgeConfig = {
  packagerConfig: {
    executableName: "blast",
    extraResource: [path.join(__dirname, "node_modules/@blastlauncher/runtime/dist/run.cjs")],
  },
  hooks: {
    postPackage: async (forgeConfig, packageResult) => {
      if (packageResult.platform !== 'darwin') return;

      const appPath = path.join(packageResult.outputPaths[0], `blast.app`);

      const { status } = spawnSync("codesign", [
        "-s",
        "-",
        "--deep",
        appPath,
      ], {
        stdio: 'inherit',
      });

      if (status !== 0) {
        throw new Error("codesign");
      }
    }
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}, ["win32"]),
    new MakerZIP({}, ["darwin", "linux"]),
    new MakerRpm({}, ["linux"]),
    new MakerDeb({}, ["linux"]),
  ],
  plugins: [
    new WebpackPlugin({
      devContentSecurityPolicy: `default-src * self blob: data: gap:; style-src * self 'unsafe-inline' blob: data: gap:; script-src * 'self' 'unsafe-eval' 'unsafe-inline' blob: data: gap:; object-src * 'self' blob: data: gap:; img-src * self 'unsafe-inline' blob: data: gap:; connect-src self * 'unsafe-inline' blob: data: gap: localhost; frame-src * self blob: data: gap:;`,
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./src/index.html",
            js: "./src/renderer.ts",
            name: "main_window",
            preload: {
              js: "./src/preload.ts",
            },
          },
          {
            html: "./src/nodeInstaller.html",
            js: "./src/nodeInstaller/renderer.ts",
            name: "node_installer",
            preload: {
              js: "./src/nodeInstaller/preload.ts",
            },
          },
        ],
      },
    }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "blastlauncher",
          name: "blast",
        },
        draft: true,
        prerelease: false,
      },
    },
  ],
};

export default config;
