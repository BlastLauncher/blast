declare module "esbuild-wasm" {
  export type BuildResult = {
    outputFiles: Array<{ text: string; contents: Uint8Array }> | undefined;
    warnings: Array<{ text: string }> | undefined;
  };
  export function initialize(options: { wasmURL: string; worker: boolean }): Promise<void>;
  export function build(options: object): Promise<BuildResult>;
}

declare module "react/jsx-runtime" {
  export const jsx: (...args: unknown[]) => unknown;
  export const jsxs: (...args: unknown[]) => unknown;
  export const Fragment: unknown;
}
declare namespace JSX {
  interface IntrinsicElements {
    [element: string]: Record<string, unknown>;
  }
}

declare module "playwright" {
  export type ConsoleMessage = { type(): string; text(): string };
  export type PageError = { message: string };
  export type Response = { status(): number; url(): string; body(): Promise<Buffer> };
  export type Route = {
    fulfill(options: { contentType: string; body: string }): Promise<void>;
  };
  export type Locator = {
    first(): Locator;
    boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
    selectOption(values: string | string[]): Promise<unknown>;
    waitFor(options?: {
      timeout?: number;
      state?: "attached" | "detached" | "visible" | "hidden";
    }): Promise<void>;
    fill(value: string): Promise<void>;
    pressSequentially(value: string): Promise<void>;
    inputValue(): Promise<string>;
    isChecked(): Promise<boolean>;
    count(): Promise<number>;
    innerText(): Promise<string>;
    textContent(): Promise<string | null>;
    click(): Promise<void>;
    getAttribute(name: string): Promise<string | null>;
  };
  export const chromium: {
    launch(options: { headless: boolean }): Promise<Browser>;
  };
  export const firefox: {
    launch(options: { headless: boolean }): Promise<Browser>;
  };
  export type Browser = {
    newPage(options?: {
      colorScheme?: "dark" | "light";
      viewport?: { width: number; height: number };
    }): Promise<Page>;
    close(): Promise<void>;
  };
  export type Page = {
    setViewportSize(size: { width: number; height: number }): Promise<void>;
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
    url(): string;
    waitForTimeout(ms: number): Promise<void>;
    context(): {
      route(url: string, handler: (route: Route) => Promise<void>): Promise<void>;
      waitForEvent(event: "page", options?: { timeout?: number }): Promise<Page>;
    };
    locator(selector: string): Locator;
    getByRole(role: string, options: { name: RegExp | string }): Locator;
    getByText(text: RegExp | string): Locator;
    keyboard: { press(key: string): Promise<void>; type(text: string): Promise<void> };
    mouse: {
      move(x: number, y: number, options?: { steps?: number }): Promise<void>;
      wheel(deltaX: number, deltaY: number): Promise<void>;
      click(x: number, y: number): Promise<void>;
      down(): Promise<void>;
      up(): Promise<void>;
    };
  };
}

declare module "react-dom/client" {
  export type Root = { render(node: unknown): void; unmount(): void };
  export function createRoot(element: HTMLElement): Root;
}
