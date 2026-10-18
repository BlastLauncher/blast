import type { V2ClientRendererAPI } from "../renderer/v2Types";

declare global {
  interface Window {
    electron: {
      startNodeInstallation: () => Promise<boolean>;
      exitAndStart: () => Promise<void>;
      closeWindow: () => void;
      v2?: V2ClientRendererAPI;
    };
  }
}

export type { V2ClientRendererAPI };
