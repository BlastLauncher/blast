declare module "react-devtools-core" {
  import type { w3cwebsocket as W3CWebSocket } from "websocket";
  type ResolveNativeStyle = any;
  type DevToolsSettingsManager = any;

  interface ConnectOptions {
    host?: string;
    nativeStyleEditorValidAttributes?: ReadonlyArray<string>;
    port?: number;
    useHttps?: boolean;
    resolveRNStyle?: ResolveNativeStyle;
    retryConnectionDelay?: number;
    isAppActive?: () => boolean;
    websocket?: WebSocket | W3CWebSocket | null;
    devToolsSettingsManager?: DevToolsSettingsManager | null;
  }

  export function connectToDevTools(options?: ConnectOptions): void;
}
