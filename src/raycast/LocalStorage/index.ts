import { createDebug } from "../../utils/debug";

const debug = createDebug("blast:utils:LocalStorage");

type Value = string | number | boolean;
type Values = Record<string, Value>;

// TODO: Implement LocalStorage to use real storage
const fakeStorage: Values = {};

export class LocalStorage {
  static async getItem(key: string): Promise<Value | undefined> {
    debug(`TODO: LocalStorage.getItem(${key})`);

    return fakeStorage[key];
  }

  static async setItem(key: string, value: Value): Promise<void> {
    debug(`TODO: LocalStorage`);

    fakeStorage[key] = value;
  }

  static async removeItem(key: string): Promise<void> {
    debug(`TODO: LocalStorage.removeItem(${key})`);

    delete fakeStorage[key];
  }

  static async allItems(): Promise<Values> {
    debug(`TODO: LocalStorage.allItems()`);

    return fakeStorage;
  }
}
