#!/usr/bin/env node
import { execSync } from "child_process";
import path from "path";

import { Octokit } from "@octokit/core";
import { Command } from "commander";
import esbuild from "esbuild";
import fs from "fs-extra";
import semver from "semver";
import { temporaryFile } from "tempy";

class PackageVersionHelper {
  constructor(token, org, repo) {
    this.octokit = new Octokit({
      auth: token,
    });
    this.org = org;
    this.repo = repo;
  }

  async initialize() {
    this.packageList = await this.fetchPackageList(this.org, this.repo);
  }

  async fetchPackageList(org, repo) {
    const res = await this.octokit.request("GET /orgs/{org}/packages?package_type=npm", {
      org,
    });

    return res.data.filter((pkg) => pkg.repository.full_name === `${org}/${repo}`);
  }

  async getPackageVersion(packageName) {
    // /orgs/BlastLauncher/packages/npm/todo-list/versions
    const pkg = this.packageList.find((pkg) => pkg.name === packageName);

    if (!pkg) {
      return null;
    }

    const res = await this.octokit.request("GET /orgs/{org}/packages/npm/{package_name}/versions", {
      org: this.org,
      package_name: packageName,
    });

    console.log("version count", res.data.length);

    if (res.data.length === 0) {
      return null;
    } else {
      return res.data[0].name;
    }
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
 * @param {string} githubToken
 * @param {string} extensionRepository
 */
async function publishExtensions(extensionFolder, githubToken, extensionRepository) {
  const [org, repo] = extensionRepository.split("/");

  const versionHelper = new PackageVersionHelper(githubToken, org, repo);
  await versionHelper.initialize();

  console.log(`\nEntering ${extensionFolder}\n`);
  execSync(`cd "${extensionFolder}"`);

  const distDir = path.resolve(extensionFolder, "dist");

  if (!fs.existsSync(distDir)) {
    console.error(`dist directory does not exist at ${distDir}`);
    process.exit(1);
  }

  const packageName = versionHelper.getPackageName(extensionFolder);
  let version = await versionHelper.getPackageVersion(packageName);
  if (version) {
    console.info(`current version is ${version}`);
    version = semver.inc(version, "major");
  } else {
    console.info(`no version found, using 1.0.0`);
    version = "1.0.0";
  }

  updatePackageInfo(distDir, version);

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

  console.info(`entry points [${esbuildConfigs.map((config) => config.input).join(", ")}]`);

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
 * @returns {void}
 * add extra information to package.json
 **/
function updatePackageInfo(targetDir, version) {
  const packagePath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  // prepend @BlastLauncher to name if it's not already there
  if (!packageJson.name.startsWith("@BlastLauncher")) {
    packageJson.name = `@BlastLauncher/${packageJson.name}`;
  }

  // add repository field
  packageJson.repository = "https://github.com/BlastLauncher/extensions.git";

  packageJson.publishConfig = {
    registry: "https://npm.pkg.github.com",
  };

  // add version
  packageJson.version = version;

  // write package.json
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2), "utf8");
}

const program = new Command();

program.name("blast-cli").description("CLI for Blast Launcher");

program
  .command("publish")
  .description("Publish extensions")
  .argument("<path>", "Path to extensions folder")
  .argument("<github_token>", "GitHub token to publish to GitHub packages")
  .argument("<extension_repository>", "GitHub repository to publish to, e.g. BlastLauncher/extensions")
  .action((dir, github_token, extension_repository) => {
    return publishExtensions(dir, github_token, extension_repository);
  });

program
  .command("build")
  .description("Build extensions")
  .argument("<path>", "Path to extension")
  .option("-o, --output <output>", "Output directory")
  .action((path, options) => {
    return buildExtension(path, options.output);
  });

program.parse();
