declare module "react-devtools-core/backend" {
  interface ConnectOptions {
    host?: string;
    nativeStyleEditorValidAttributes?: ReadonlyArray<string>;
    port?: number;
    useHttps?: boolean;
    resolveRNStyle?: ResolveNativeStyle;
    retryConnectionDelay?: number;
    isAppActive?: () => boolean;
    websocket?: WebSocket | null;
    devToolsSettingsManager?: DevToolsSettingsManager | null;
    // ...
  }

  export function connectToDevTools(options?: ConnectOptions): void;
}
