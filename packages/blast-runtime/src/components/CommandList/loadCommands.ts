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

import fs from "fs/promises";
import os from "os";
import path from "path";

interface Command {
  name: string;
  title: string;
  description: string;
  mode: string;
  subtitle?: string;
  requirePath: string;
}

const getPackageJsonPath = (): string => {
  const homeDir = os.homedir();
  return path.join(homeDir, ".blast", "extensions", "package.json");
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
    await fs.access(packageJsonPath);
  } catch (error: any) {
    switch (error.code) {
      case "ENOENT":
        // file does not exist
        await fs.mkdir(path.dirname(packageJsonPath), { recursive: true });
        await fs.writeFile(packageJsonPath, JSON.stringify({ dependencies: {} }, null, 2));
        break;
      default:
        console.error("Error loading commands:", error);
        break;
    }

    return [];
  }

  const packageJson = safeParse(await fs.readFile(packageJsonPath, "utf-8"));
  const dependencies = packageJson.dependencies;

  // 2. For each dependency starts with @blast-extensions, read its package.json inside node_modules
  const extensionPackages = Object.keys(dependencies).filter((dep) => dep.startsWith("@blast-extensions"));

  return extensionPackages;
}

export async function loadCommands(): Promise<Command[]> {
  try {
    const homeDir = os.homedir();
    const extensionPackages = await loadInstalledExtensions();
    const commands: Command[] = [];

    for (const extPackage of extensionPackages) {
      const extPackageJsonPath = path.join(homeDir, ".blast", "extensions", "node_modules", extPackage, "package.json");
      const extPackageJson = safeParse(await fs.readFile(extPackageJsonPath, "utf-8"));

      // 3. For each command in package.json, return its commands field
      if (extPackageJson.commands) {
        for (const command of extPackageJson.commands) {
          commands.push({
            ...command,
            requirePath: path.join(homeDir, ".blast", "extensions", "node_modules", extPackage, command.name + ".js"),
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
