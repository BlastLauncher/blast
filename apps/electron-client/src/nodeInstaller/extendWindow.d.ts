interface Window {
  electron: {
    startNodeInstallation: () => Promise<boolean>;
    exitAndStart: () => Promise<void>;
    closeWindow: () => void;
  };
}
