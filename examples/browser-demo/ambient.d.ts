declare module "esbuild-wasm" {
  export type BuildResult = {
    outputFiles: Array<{ text: string; contents: Uint8Array }> | undefined;
    warnings: Array<{ text: string }> | undefined;
  };
  export function initialize(options: { wasmURL: string; worker: boolean }): Promise<void>;
  export function build(options: object): Promise<BuildResult>;
}

declare module "playwright" {
  export type ConsoleMessage = { type(): string; text(): string };
  export type PageError = { message: string };
  export type Response = { status(): number; url(): string; body(): Promise<Buffer> };
  export type Route = {
    fulfill(options: { contentType: string; body: string }): Promise<void>;
  };
  export type Locator = {
    waitFor(options?: { timeout?: number }): Promise<void>;
    fill(value: string): Promise<void>;
    count(): Promise<number>;
    innerText(): Promise<string>;
    textContent(): Promise<string | null>;
    click(): Promise<void>;
  };
  export const chromium: {
    launch(options: { headless: boolean }): Promise<Browser>;
  };
  export type Browser = {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  };
  export type Page = {
    addInitScript(pageFunction: () => void): Promise<void>;
    goto(url: string, options?: { waitUntil?: "load" }): Promise<unknown>;
    close(): Promise<void>;
    screenshot(options: { path: string; fullPage?: boolean }): Promise<unknown>;
    evaluate<T>(pageFunction: () => T): Promise<T>;
    evaluate<T, A>(pageFunction: (arg: A) => T, arg: A): Promise<T>;
    waitForFunction<T>(pageFunction: () => T, options?: { timeout?: number }): Promise<unknown>;
    waitForFunction<T, A>(
      pageFunction: (arg: A) => T,
      arg: A,
      options?: { timeout?: number },
    ): Promise<unknown>;
    route(url: string, handler: (route: Route) => Promise<void>): Promise<void>;
    on(event: "console", handler: (message: ConsoleMessage) => void): void;
    on(event: "pageerror", handler: (error: PageError) => void): void;
    on(event: "response", handler: (response: Response) => void): void;
    off(event: "response", handler: (response: Response) => void): void;
    reload(options?: { waitUntil?: "load" }): Promise<unknown>;
    locator(selector: string): Locator;
    getByRole(role: string, options: { name: RegExp | string }): Locator;
    keyboard: { press(key: string): Promise<void> };
  };
}
