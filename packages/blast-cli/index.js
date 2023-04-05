#!/usr/bin/env node
import { execSync } from "child_process";
import https from "https";
import path from "path";

import { Command } from "commander";
import esbuild from "esbuild";
import fs from "fs-extra";
import semver from "semver";
import { temporaryFile } from "tempy";

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", (e) => {
        reject(e);
      });
  });
}

class PackageVersionHelper {
  constructor(npmOrg, registryUrl = "https://registry.npmjs.org") {
    this.npmOrg = npmOrg;
    this.registryUrl = registryUrl;
  }

  async fetchPackageVersions(packageName) {
    let res;
    try {
      console.log(`fetching ${this.registryUrl}/@${this.npmOrg}/${packageName}`);
      res = await getJSON(`${this.registryUrl}/@${this.npmOrg}/${packageName}`);

      if (res.error) {
        return null;
      }

      return Object.keys(res.versions);
    } catch (e) {
      // pacakge not found
      return null;
    }
  }

  async getLatestVersion(versions) {
    const sortedVersions = versions.sort((a, b) => semver.compare(a, b));
    return sortedVersions[sortedVersions.length - 1];
  }

  async getPackageVersion(packageName) {
    const versions = await this.fetchPackageVersions(packageName);
    if (!versions) {
      return null;
    }

    return this.getLatestVersion(versions);
  }

  getPackageName(extensionFolder) {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(extensionFolder, "package.json"), "utf8"));
    let packageName = packageJson.name;
    if (packageName.startsWith("@")) {
      packageName = packageName.split("/")[1];
    }
    packageName = packageName.toLowerCase();

    console.debug(`package name is ${packageName}`);

    return packageName;
  }
}

/**
 * @param {string} extensionFolder
 * @param {string} npmOrganization
 * @param {string} npmRegistry
 * @param {string} distDir
 */
async function publishExtensions(extensionFolder, npmOrganization, npmRegistry, distDir) {
  const versionHelper = new PackageVersionHelper(npmOrganization, npmRegistry);

  console.log(`\nEntering ${extensionFolder}\n`);
  execSync(`cd "${extensionFolder}"`);

  if (!distDir) {
    distDir = path.resolve(extensionFolder, "dist");
  }

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  await buildExtension(extensionFolder, distDir);

  const packageName = versionHelper.getPackageName(extensionFolder);
  let version = await versionHelper.getPackageVersion(packageName);
  if (version) {
    console.info(`current version is ${version}`);
    version = semver.inc(version, "major");
  } else {
    console.info(`no version found, using 1.0.0`);
    version = "1.0.0";
  }

  updatePackageInfo(distDir, version, npmOrganization);

  console.info(`publishing version ${version}`);

  // publish to npm
  execSync(`npm publish --access public`, {
    cwd: distDir,
  });
}

function getTSConfigPath(extensionDir) {
  const originalTSconfigPath = path.resolve(extensionDir, "tsconfig.json");
  const tsconfigJson = JSON.parse(fs.readFileSync(originalTSconfigPath, "utf8"));

  tsconfigJson.compilerOptions.jsx = "react";
  tsconfigJson.compilerOptions.strict = false;

  const tempTSconfigPath = temporaryFile({ extension: "json" });

  fs.writeFileSync(tempTSconfigPath, JSON.stringify(tsconfigJson, null, 2));

  return tempTSconfigPath;
}

async function buildExtension(extensionDir, outputFolder) {
  // Gather entry points from target extension's packages.json
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(extensionDir, "package.json"), "utf8"));
  if (!outputFolder) {
    outputFolder = path.resolve(extensionDir, "dist");
  }

  const commandNames = packageJson.commands.map((command) => command.name);

  const supportedExts = [".js", ".ts", ".tsx", ".jsx"];

  const tsconfigPath = getTSConfigPath(extensionDir);

  const esbuildConfigs = commandNames.map((commandName) => {
    const files = fs.readdirSync(path.join(extensionDir, "src"));
    const entry = files.find((file) => {
      return supportedExts.some((ext) => file === `${commandName}${ext}`);
    });

    if (!entry) {
      throw new Error(`No entry point found for ${commandName}`);
    }

    const entryPath = path.join(extensionDir, "src", entry);
    const outputPath = path.join(outputFolder, `${commandName}.js`);

    console.debug(`entry point for ${commandName} is ${entryPath}`);

    return {
      input: entryPath,
      output: outputPath,
    };
  });

  console.info(`entry points [${esbuildConfigs.map((config) => config.input).join(" ")}]`);

  // Build each entry point
  for (const config of esbuildConfigs) {
    await esbuild.build({
      entryPoints: [config.input],
      bundle: true,
      platform: "node",
      outfile: config.output,
      external: ["@raycast/api", "react"],
      jsx: "transform",
      jsxFactory: "_jsx",
      jsxFragment: "_jsxFragment",
      tsconfig: tsconfigPath,
      minify: true,
    });
  }

  // copy the package.json to the output folder
  fs.copyFileSync(path.join(extensionDir, "package.json"), path.join(outputFolder, "package.json"));

  // copy assets directory to the output folder
  const assetsDir = path.join(extensionDir, "assets");
  if (fs.existsSync(assetsDir)) {
    fs.copySync(assetsDir, path.join(outputFolder, "assets"));
  }
}

/**
 * @param {string} targetDir
 * @param {string} version
 * @param {string} npmOrganization
 * @returns {void}
 * add extra information to package.json
 **/
function updatePackageInfo(targetDir, version, npmOrganization) {
  const packagePath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  // prepend @BlastLauncher to name if it's not already there
  if (!packageJson.name.startsWith(`@${npmOrganization}`)) {
    packageJson.name = `@${npmOrganization}/${packageJson.name}`;
  }

  // add repository field
  packageJson.repository = "https://github.com/BlastLauncher/extensions.git";

  // add version
  packageJson.version = version;

  // exclude original publish script
  packageJson.scripts = Object.keys(packageJson.scripts)
    .filter((key) => key !== "publish")
    .reduce((obj, key) => {
      obj[key] = packageJson.scripts[key];
      return obj;
    }, {});

  // write package.json
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2), "utf8");
}

const program = new Command();

program.name("blast-cli").description(`CLI for Blast Launcher

Example Usage:
  blast build ./extensions/todo-list -o ./extensions/todo-list/dist
  blast publish ./extensions/todo-list blast-extensions`);

program
  .command("publish")
  .description("Publish extensions")
  .argument("<path>", "Path to extensions folder")
  .argument("<organization>", "NPM organization to publish to, e.g. blast-extensions")
  .option("-r, --registry <registry>", "NPM registry to publish to", "https://registry.npmjs.org")
  .option("-o, --output <output>", "Output directory, default to ./dist folder relative to extension path")
  .action((dir, organization, options) => {
    return publishExtensions(dir, organization, options.registry, options.output);
  });

program
  .command("build")
  .description("Build extensions")
  .argument("<path>", "Path to extension")
  .option("-o, --output <output>", "Output directory, default to ./dist folder relative to extension path")
  .action((path, options) => {
    return buildExtension(path, options.output);
  });

program.parse();
