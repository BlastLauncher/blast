// `LocalStorage`, backed by the host's `storage.*` capabilities. Only keys and
// values cross the process boundary; the host keys the store by the session's
// extension, so the extension name never appears here or in params.
import { requestCapability } from "./capability.ts";

/** `LocalStorage.Value` (the deprecated `LocalStorageValue` alias). */
export type LocalStorageValue = string | number | boolean;

/** `LocalStorage.Values` (the deprecated `LocalStorageValues` alias). */
export interface LocalStorageValues {
  [key: string]: LocalStorageValue;
}

function checkKey(key: string, api: string): string {
  if (typeof key !== "string" || key === "")
    throw new TypeError(`${api}: key must be a non-empty string`);
  return key;
}

function checkValue(value: unknown, api: string): LocalStorageValue {
  if (
    typeof value !== "string" &&
    !(typeof value === "number" && Number.isFinite(value)) &&
    typeof value !== "boolean"
  ) {
    throw new TypeError(`${api}: value must be a string, number or boolean`);
  }
  return value;
}

async function getItem<T extends LocalStorageValue = LocalStorageValue>(
  key: string,
): Promise<T | undefined> {
  checkKey(key, "LocalStorage.getItem");
  // The host answers `null` for a key it does not have.
  const value = await requestCapability("storage.get", { key });
  return (value ?? undefined) as T | undefined;
}

async function setItem(key: string, value: LocalStorageValue): Promise<void> {
  checkKey(key, "LocalStorage.setItem");
  checkValue(value, "LocalStorage.setItem");
  await requestCapability("storage.set", { key, value });
}

async function removeItem(key: string): Promise<void> {
  checkKey(key, "LocalStorage.removeItem");
  await requestCapability("storage.remove", { key });
}

async function allItems<T extends LocalStorageValues = LocalStorageValues>(): Promise<T> {
  return (await requestCapability("storage.all", {})) as T;
}

async function clear(): Promise<void> {
  await requestCapability("storage.clear", {});
}

export const LocalStorage = { getItem, setItem, removeItem, allItems, clear };

// Deprecated top-level aliases from the declarations.
export const getLocalStorageItem = getItem;
export const setLocalStorageItem = setItem;
export const removeLocalStorageItem = removeItem;
export const allLocalStorageItems = allItems;
export const clearLocalStorage = clear;
