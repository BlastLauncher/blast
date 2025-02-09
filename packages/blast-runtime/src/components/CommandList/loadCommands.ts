// 1. load ~/.blast/extensions/package.json dependencies
// 2. For each dependency starts with @blast-extension, read its package.json inside node_modules
// 3. For each command in package.json, return its commands field, which is an array of command objects
// 4. command object has the following fields:
// "commands": [
//  {
//     "name": "index",
//     "title": "Show Todos",
//     "description": "Show a list of all todos.",
//     "mode": "view"
//   }
// ]

import fs from "node:fs";
import fsPromise from "node:fs/promises";
import path from "node:path";

import { EXTENSIONS_DIR, DEV_EXTENSIONS_DIR } from "../../constants";

interface Command {
  name: string;
  title: string;
  description: string;
  mode: string;
  subtitle?: string;
  requirePath: string;
}

const getPackageJsonPath = (): string => {
  return path.join(EXTENSIONS_DIR, "package.json");
};

const safeParse = (json: string): any => {
  try {
    return JSON.parse(json);
  } catch (error) {
    return {};
  }
};

export async function loadInstalledExtensions(): Promise<string[]> {
  const packageJsonPath = getPackageJsonPath();

  // check if package.json exists
  try {
    await fsPromise.access(packageJsonPath);
  } catch (error: any) {
    switch (error?.code) {
      case "ENOENT":
        // file does not exist
        await fsPromise.mkdir(path.dirname(packageJsonPath), { recursive: true });
        await fsPromise.writeFile(packageJsonPath, "{}");
        break;
      default:
        console.error("Error loading commands:", error);
        break;
    }

    return [];
  }

  // Load production extensions from EXTENSIONS_DIR
  const prodPackageJsonPath = path.join(EXTENSIONS_DIR, "package.json");
  let prodDeps = {};
  try {
    await fsPromise.access(prodPackageJsonPath);
    const prodPackageJson = safeParse(await fsPromise.readFile(prodPackageJsonPath, "utf-8")) || {};
    prodDeps = prodPackageJson.dependencies || {};
  } catch (error) {
    // File might not exist; leave prodDeps empty
  }

  // Load dev extensions from DEV_EXTENSIONS_DIR
  const devPackageJsonPath = path.join(DEV_EXTENSIONS_DIR, "package.json");
  let devDeps = {};
  try {
    await fsPromise.access(devPackageJsonPath);
    const devPackageJson = safeParse(await fsPromise.readFile(devPackageJsonPath, "utf-8")) || {};
    devDeps = devPackageJson.dependencies || {};
  } catch (error) {
    // No dev extensions configured; leave devDeps empty
  }

  // Create a map of extensions where dev takes precedence over prod
  const extMap: Record<string, boolean> = {};
  for (const dep of Object.keys(prodDeps).filter((dep) => dep.startsWith("@blast-extensions"))) {
    extMap[dep] = true;
  }

  for (const dep of Object.keys(devDeps)) {
    extMap[dep] = true;
  }

  return Object.keys(extMap);
}

export async function loadCommands(): Promise<Command[]> {
  try {
    const extensionPackages = await loadInstalledExtensions();
    const commands: Command[] = [];

    for (const extPackage of extensionPackages) {
      // Look in dev first and then fall back to production; dev commands overwrite in conflicts.
      const devPackageJsonPath = path.join(DEV_EXTENSIONS_DIR, "node_modules", extPackage, "package.json");
      const prodPackageJsonPath = path.join(EXTENSIONS_DIR, "node_modules", extPackage, "package.json");
      const isDev = fs.existsSync(devPackageJsonPath)

      const extPackageJsonPath = isDev ? devPackageJsonPath : prodPackageJsonPath;

      const extPackageJson = safeParse(await fsPromise.readFile(extPackageJsonPath, "utf-8"));

      // 3. For each command in package.json, return its commands field
      if (extPackageJson.commands) {
        const baseDir = fs.existsSync(devPackageJsonPath) ? DEV_EXTENSIONS_DIR : EXTENSIONS_DIR;
        for (const command of extPackageJson.commands) {
          commands.push({
            ...command,
            requirePath: path.join(baseDir, "node_modules", extPackage, `${command.name}.js`),
            env: {
              assetsPath: path.join(baseDir, "node_modules", extPackage, 'assets'),
              commandName: command.name,
              extensionName: extPackageJson.name,
              isDevelopment: isDev,
            }
          });
        }
      }
    }
    return commands;
  } catch (error) {
    console.error("Error loading commands:", error);
    return [];
  }
}
