import os from "os";
import path from "path";

import { createDebug } from "@blastlauncher/utils";
import fs from "fs-extra";

const debug = createDebug("blast:utils:LocalStorage");

const applicationHome = path.join(os.homedir(), ".blast");
fs.ensureDirSync(applicationHome);

// TODO: make this extension-specific
debug("LocalStorage initialized");
const localStoragePath = path.join(applicationHome, "localStorage.json");
fs.ensureFileSync(localStoragePath);

type Value = string | number | boolean;
type Values = Record<string, Value>;

export class LocalStorage {
  static async getItem(key: string): Promise<Value | undefined> {
    debug(`LocalStorage.getItem(${key})`);

    const data = this.loadJSON();
    return data[key];
  }

  static async setItem(key: string, value: Value): Promise<void> {
    debug("setItem", key, value);

    const data = this.loadJSON();
    data[key] = value;
    this.saveJSON(data);
  }

  static async removeItem(key: string): Promise<void> {
    debug(`LocalStorage.removeItem(${key})`);

    const data = this.loadJSON();
    delete data[key];
    this.saveJSON(data);
  }

  static async allItems(): Promise<Values> {
    debug(`LocalStorage.allItems()`);

    return this.loadJSON();
  }

  private static loadJSON() {
    const json = fs.readFileSync(localStoragePath, "utf8");

    try {
      return JSON.parse(json) as Values;
    } catch (error) {
      debug("Error parsing localStorage.json", error);
      return {};
    }
  }

  private static saveJSON(data: Values) {
    fs.writeFileSync(localStoragePath, JSON.stringify(data, null, 2));
  }
}
