import { createDebug } from "../../utils/debug";

const debug = createDebug("blast:utils:LocalStorage");

type Value = string | number | boolean;
type Values = Record<string, Value>;

// TODO: Implement LocalStorage to use real storage
debug("LocalStorage initialized");
const fakeStorage: Values = {};

export class LocalStorage {
  static async getItem(key: string): Promise<Value | undefined> {
    debug(`LocalStorage.getItem(${key})`);

    return fakeStorage[key];
  }

  static async setItem(key: string, value: Value): Promise<void> {
    debug("setItem", key, value);

    fakeStorage[key] = value;
  }

  static async removeItem(key: string): Promise<void> {
    debug(`LocalStorage.removeItem(${key})`);

    delete fakeStorage[key];
  }

  static async allItems(): Promise<Values> {
    debug(`LocalStorage.allItems()`, fakeStorage);

    return fakeStorage;
  }
}
