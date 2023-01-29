#!/usr/bin/env node
import { execSync } from "child_process";
import path from "path";

import { Octokit } from "@octokit/core";
import { babel } from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import { Command } from "commander";
import fs from "fs-extra";
import { publish } from "libnpmpublish";
import pacote from "pacote";
import { rollup } from "rollup";
import semver from "semver";

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
      return res.data[0].version;
    }
  }
}

/**
 * @param {string} paths
 * @param {string} githubToken
 * @param {string} extensionRepository
 */
async function publishExtensions(paths, githubToken, extensionRepository) {
  const [org, repo] = extensionRepository.split("/");

  const versionHelper = new PackageVersionHelper(githubToken, org, repo);
  await versionHelper.initialize();

  for (const dir of paths.split("\n")) {
    const extensionFolder = path.basename(dir);
    console.log(`\nEntering ${dir}\n`);
    execSync(`cd "${dir}"`);

    try {
      if (!fs.existsSync("./package-lock.json")) {
        throw new Error(`Missing package-lock.json for ${extensionFolder}`);
      }
    } catch (err) {
      console.log(`::error::${err.message}`);
      process.exit(1);
    }

    try {
      if (fs.existsSync("./yarn.lock")) {
        throw new Error(`Remove yarn.lock for ${extensionFolder}`);
      }
    } catch (err) {
      console.log(`::error::${err.message}`);
      process.exit(1);
    }

    let npmCiError;
    try {
      execSync(`npm ci --silent`);
    } catch (err) {
      npmCiError = err;
    }

    if (npmCiError) {
      console.log(`::error::Npm ci failed for ${extensionFolder}`);
      continue;
    }

    // !FIXME: do not rely on ray cli
    // It's closed source and not available on macOS
    let rayBuildError;
    try {
      execSync(`ray build -e dist`);
    } catch (err) {
      rayBuildError = err;
    }
    if (rayBuildError) {
      console.log(`::error::Ray build failed for ${extensionFolder}`);
      continue;
    }

    const pwd = process.cwd();
    const distDir = path.join(pwd, "dist");

    let version = await versionHelper.getPackageVersion(extensionFolder);
    if (version) {
      version = semver.inc(version, "major");
    } else {
      version = "1.0.0";
    }

    updatePackageInfo(distDir, version);

    // publish to npm
    const manifest = await pacote.manifest(distDir);
    const tarData = await pacote.tarball(path);

    await publish(manifest, tarData);
  }
}

async function buildExtension(extensionDir, outputFolder) {
  // Gather entry points from target extension's packages.json
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"));

  const commandNames = packageJson.commands.map((command) => command.name);

  const supportedExts = [".js", ".ts", ".tsx", ".jsx"];
  const rollupConfigs = commandNames.map((commandName) => {
    const files = fs.readdirSync(path.join(extensionDir, "src"));
    const entry = files.find((file) => {
      return supportedExts.some((ext) => file === `${commandName}${ext}`);
    });

    if (!entry) {
      throw new Error(`No entry point found for ${commandName}`);
    }

    const entryPath = path.join(extensionDir, "src", entry);

    console.debug(`entry point for ${commandName} is ${entryPath}`);

    return {
      input: {
        input: entryPath,
        plugins: [
          nodeResolve({
            rootDir: path.resolve(extensionDir),
            extensions: supportedExts,
          }),
          commonjs(),
          babel({
            babelHelpers: "bundled",
            presets: ["@babel/preset-typescript"],
            plugins: [
              [
                "@babel/plugin-transform-react-jsx",
                {
                  runtime: "classic",
                },
              ],
            ],
            extensions: supportedExts,
          }),
          replace({
            "React.createElement": "_jsx",
            "React.Fragment": "_jsxFragment",
            preventAssignment: true,
          }),
          terser(),
        ],
        external: ["@raycast/api", "react", "my-lib/jsx-runtime"],
      },
      output: {
        file: path.join(outputFolder, `${commandName}.js`),
        format: "cjs",
      },
    };
  });

  console.info(`entry points [${rollupConfigs.map((config) => config.input.input).join(", ")}]`);

  // Build each entry point
  for (const config of rollupConfigs) {
    const bundle = await rollup(config.input);
    await bundle.write(config.output);
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
  .argument("<paths>", "Paths to extensions, separated by new line")
  .argument("<github_token>", "GitHub token to publish to GitHub packages")
  .argument("<extension_repository>", "GitHub repository to publish to, e.g. BlastLauncher/extensions")
  .action((paths, github_token, extension_repository) => {
    return publishExtensions(paths, github_token, extension_repository);
  });

program
  .command("build")
  .description("Build extensions")
  .argument("<path>", "Paths to extension")
  .option("-o, --output <output>", "Output directory")
  .action((path, options) => {
    return buildExtension(path, options.output);
  });

program.parse();
