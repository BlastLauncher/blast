import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { environment } from "./environment";

const USER_DIR = path.join(os.homedir(), ".blast");

export class Cache {
  static get DEFAULT_CAPACITY(): number {
    return 10 * 1024 * 1024; // 10 MB
  }

  private directory: string;
  private namespace?: string;
  private capacity: number;
  private journal: string[] = [];
  private storage: Map<string, string> = new Map();
  private subscribers: CacheSubscriber[] = [];

  constructor(options?: CacheOptions) {
    if (options?.directory) {
      this.directory = options.directory;
    } else {
      const ns = options?.namespace || "default";
      let extName = environment.extensionName || "defaultExtension";
      if (environment.isDevelopment) {
        extName = `dev_${extName}`;
      }
      // Store under $USER_DIR/.cache/<extension_name>/<namespace>
      this.directory = path.join(USER_DIR, ".cache", extName, ns);
    }
    if (options?.namespace) {
      this.namespace = options.namespace;
    }
    this.capacity = options?.capacity ?? Cache.DEFAULT_CAPACITY;

    // Ensure the storage directory exists
    const fullDir = this.storageDirectory;
    if (!existsSync(fullDir)) {
      mkdirSync(fullDir, { recursive: true });
    }
  }

  /**
   * @returns the full path to the directory where the data is stored on disk.
   */
  get storageDirectory(): string {
    return this.directory;
  }

  /**
   * @returns the data for the given key. If there is no data for the key, `undefined` is returned.
   * @remarks If you want to just check for the existence of a key, use {@link has}.
   */
  get(key: string): string | undefined {
    if (this.storage.has(key)) {
      this._moveKeyToEnd(key);
      return this.storage.get(key);
    }
    return undefined;
  }

  /**
   * @returns `true` if data for the key exists, `false` otherwise.
   * @remarks You can use this method to check for entries without affecting the LRU access.
   */
  has(key: string): boolean {
    return this.storage.has(key);
  }

  /**
   * @returns `true` if the cache is empty, `false` otherwise.
   */
  get isEmpty(): boolean {
    return this.storage.size === 0;
  }

  /**
   * Sets the data for the given key.
   * If the data exceeds the configured `capacity`, the least recently used entries are removed.
   * This also notifies registered subscribers (see {@link subscribe}).
   */
  set(key: string, data: string): void {
    if (this.storage.has(key)) {
      this.storage.set(key, data);
      this._moveKeyToEnd(key);
    } else {
      this.storage.set(key, data);
      this.journal.push(key);
    }
    this.maintainCapacity();
    this.notifySubscribers(key, data);
  }

  /**
   * Removes the data for the given key.
   * This also notifies registered subscribers (see {@link subscribe}).
   * @returns `true` if data for the key was removed, `false` otherwise.
   */
  remove(key: string): boolean {
    if (!this.storage.has(key)) return false;
    this.storage.delete(key);
    this._removeFromJournal(key);
    this.notifySubscribers(key, undefined);
    return true;
  }

  /**
   * Clears all stored data.
   * This also notifies registered subscribers (see {@link subscribe}) unless the  `notifySubscribers` option is set to `false`.
   */
  clear(options?: { notifySubscribers: boolean }): void {
    this.storage.clear();
    this.journal = [];
    if (options?.notifySubscribers !== false) {
      this.notifySubscribers(undefined, undefined);
    }
  }

  /**
   * Registers a new subscriber that gets notified when cache data is set or removed.
   * @returns a function that can be called to remove the subscriber.
   */
  subscribe(subscriber: CacheSubscriber): CacheSubscription {
    this.subscribers.push(subscriber);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== subscriber);
    };
  }

  private maintainCapacity(): void {
    // Calculate total size in bytes for stored data.
    let totalSize = 0;
    for (const data of this.storage.values()) {
      totalSize += Buffer.byteLength(data, "utf8");
    }
    // Remove least recently used items until within capacity
    while (totalSize > this.capacity && this.journal.length > 0) {
      const keyToRemove = this.journal[0];
      const data = this.storage.get(keyToRemove);
      if (data) {
        totalSize -= Buffer.byteLength(data, "utf8");
      }
      this.storage.delete(keyToRemove);
      this.journal.shift();
      this.notifySubscribers(keyToRemove, undefined);
    }
  }

  private notifySubscribers(key: string | undefined, data: string | undefined): void {
    for (const sub of this.subscribers) {
      sub(key, data);
    }
  }

  private _moveKeyToEnd(key: string): void {
    const index = this.journal.indexOf(key);
    if (index !== -1) {
      this.journal.splice(index, 1);
    }
    this.journal.push(key);
  }

  private _removeFromJournal(key: string): void {
    const index = this.journal.indexOf(key);
    if (index !== -1) {
      this.journal.splice(index, 1);
    }
  }
}

export interface CacheOptions {
  /**
   * If set, the Cache will be namespaced via a subdirectory.
   * This can be useful to separate the caches for individual commands of an extension.
   * By default, the cache is shared between the commands of an extension.
   */
  namespace?: string;
  /**
   * The parent directory for the cache data.
   * @deprecated this parameter will be removed in the future – use the default directory.
   */
  directory?: string;
  /**
   * The capacity in bytes. If the stored data exceeds the capacity, the least recently used data is removed.
   * The default capacity is 10 MB.
   */
  capacity?: number;
}

export type CacheSubscriber = (key: string | undefined, data: string | undefined) => void;
export type CacheSubscription = () => void;
