import { createDebug } from '../../utils/debug';

const debug = createDebug('blast:utils:LocalStorage');

type Value = string | number | boolean;
type Values = Record<string, Value>;

export class LocalStorage {
  static async getItem(key: string): Promise<Value | undefined> {
    debug(`TODO: LocalStorage.getItem(${key})`);

    return undefined;
  }

  static async setItem(key: string, value: Value): Promise<void> {
    debug(`TODO: LocalStorage`);
  }

  static async removeItem(key: string): Promise<void> {
    debug(`TODO: LocalStorage.removeItem(${key})`);
  }

  static async allItems(): Promise<Values> {
    debug(`TODO: LocalStorage.allItems()`);

    return {};
  }
}
