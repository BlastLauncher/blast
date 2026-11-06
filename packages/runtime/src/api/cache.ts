import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { environment } from "./environment.ts";

export type CacheOptions = { namespace?: string; directory?: string; capacity?: number };
export type CacheSubscriber = (key: string | undefined, data: string | undefined) => void;
export type CacheSubscription = () => void;
type Entries = Map<string, string>;
const subscribers = new Map<string, Set<CacheSubscriber>>();
let writes = 0;

// Namespaces are single segments even when supplied by an extension.
function segment(value: string): string {
  return encodeURIComponent(value).replaceAll(".", "%2E");
}

export class Cache {
  static get STORAGE_DIRECTORY_NAME(): string {
    return "cache";
  }
  static get DEFAULT_CAPACITY(): number {
    // Cache.Options.capacity in the public declarations specifies 10 MB.
    return 10 * 1024 * 1024;
  }
  private directory: string;
  private capacity: number;

  constructor(options: CacheOptions = {}) {
    const parent = options.directory ?? environment.supportPath;
    if (!parent) throw new Error("Cache requires an assigned support directory");
    this.capacity = options.capacity ?? Cache.DEFAULT_CAPACITY;
    if (!Number.isFinite(this.capacity) || this.capacity < 0)
      throw new Error("Cache capacity must be a finite non-negative number");
    this.directory = resolve(parent, Cache.STORAGE_DIRECTORY_NAME);
    if (options.namespace) this.directory = join(this.directory, segment(options.namespace));
    mkdirSync(this.directory, { recursive: true });
  }
  get storageDirectory(): string {
    return this.directory;
  }
  private read(): Entries {
    let text: string;
    try {
      text = readFileSync(join(this.directory, "entries.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      throw error;
    }
    const entries: unknown = JSON.parse(text);
    if (
      !Array.isArray(entries) ||
      !entries.every(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          entry.every((value) => typeof value === "string"),
      )
    )
      throw new Error("Invalid Cache entries");
    return new Map(entries);
  }
  private write(entries: Entries): void {
    const file = join(this.directory, "entries.json");
    const temporary = `${file}.${process.pid}-${++writes}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify([...entries]), "utf8");
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  private notify(key?: string, data?: string): void {
    // Callbacks may subscribe or unsubscribe while notifications are delivered.
    const snapshot = [...(subscribers.get(this.directory) ?? [])];
    for (const subscriber of snapshot) subscriber(key, data);
  }
  get(key: string): string | undefined {
    const entries = this.read();
    const data = entries.get(key);
    if (data !== undefined) {
      entries.delete(key);
      entries.set(key, data);
      this.write(entries);
    }
    return data;
  }
  has(key: string): boolean {
    return this.read().has(key);
  }
  get isEmpty(): boolean {
    return this.read().size === 0;
  }
  set(key: string, data: string): void {
    if (typeof key !== "string" || typeof data !== "string")
      throw new Error("Cache keys and data must be strings");
    const entries = this.read();
    entries.delete(key);
    entries.set(key, data);
    let bytes = [...entries.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0);
    for (const [oldKey, value] of entries) {
      if (bytes <= this.capacity) break;
      entries.delete(oldKey);
      bytes -= Buffer.byteLength(value);
    }
    this.write(entries);
    this.notify(key, data);
  }
  remove(key: string): boolean {
    const entries = this.read();
    const removed = entries.delete(key);
    if (removed) this.write(entries);
    this.notify(key);
    return removed;
  }
  clear(options?: { notifySubscribers: boolean }): void {
    this.write(new Map());
    if (options?.notifySubscribers !== false) this.notify();
  }
  subscribe = (subscriber: CacheSubscriber): CacheSubscription => {
    let listeners = subscribers.get(this.directory);
    if (!listeners) subscribers.set(this.directory, (listeners = new Set()));
    listeners.add(subscriber);
    return () => {
      listeners.delete(subscriber);
      if (!listeners.size) subscribers.delete(this.directory);
    };
  };
}
