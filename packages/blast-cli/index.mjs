import fs from "fs";
import { createRequire } from "node:module";
import path from "path";

import pack from "libnpmpack";

const require = createRequire(import.meta.url);

function getTargetDir() {
  // read target directory from args
  const targetDir = process.argv[2];

  if (!targetDir) {
    console.error("Please specify a target directory");
    return;
  }

  if (!fs.existsSync(targetDir)) {
    console.error("Target directory is not a valid path");
    return;
  }

  if (!fs.statSync(targetDir).isDirectory()) {
    console.error("Target directory is not a directory");
    return;
  }

  return targetDir;
}

// add extra information to package.json
function updatePackageInfo(targetDir) {
  const packagePath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  // prepend @BlastLauncher to name if it's not already there
  if (!packageJson.name.startsWith("@BlastLauncher")) {
    packageJson.name = `@BlastLauncher/${packageJson.name}`;
  }

  // add repository field
  packageJson.repository = "https://github.com/BlastLauncher/extensions-registry.git";

  // add version
  // TODO: fetch latest version from current registry
  // if it's not published yet, use 0.0.1
  // else bump minor version
  packageJson.version = "0.0.1";

  // write package.json
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2), "utf8");
}

async function publishPackage(dir) {
  const tarball = await pack(dir);
}

async function buildPackage(dir) {
  const packageJson = require(`${dir}/package.json`);

  // TODO: check ts or tsx file extensions
  const inputs = packageJson.commands.map((command) => path.resolve(dir, `src/${command.name}.tsx`));

  console.log(inputs);
}

async function run() {
  const targetDir = getTargetDir();

  if (!targetDir) {
    return;
  }

  // build package
  await buildPackage(targetDir);

  // updatePackageInfo(targetDir);

  // await publishPackage(targetDir);
}

run();
