import logger from '../../../src/logger';

type Value = string | number | boolean;
type Values = Record<string, Value>;

export class LocalStorage {
  static async getItem(key: string): Promise<Value | undefined> {
    logger.debug(`TODO: LocalStorage.getItem(${key})`);

    return undefined;
  }

  static async setItem(key: string, value: Value): Promise<void> {
    logger.debug(`TODO: LocalStorage`);
  }

  static async removeItem(key: string): Promise<void> {
    logger.debug(`TODO: LocalStorage.removeItem(${key})`);
  }

  static async allItems(): Promise<Values> {
    logger.debug(`TODO: LocalStorage.allItems()`);

    return {};
  }
}
