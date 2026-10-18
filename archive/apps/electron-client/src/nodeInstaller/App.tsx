import { useCallback, useState } from "react";

import { MANAGED_NODE_VERSION } from "../nodeRuntimeVersion";

export default function App() {
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  const onInstall = useCallback(async () => {
    if (isInstalling) {
      return;
    }

    setError(null);
    setIsInstalling(true);

    try {
      const success = await window.electron.startNodeInstallation();
      if (!success) {
        setError(`Node.js ${MANAGED_NODE_VERSION} could not be verified. Please try again.`);
        return;
      }
      await window.electron.exitAndStart();
    } catch (cause: unknown) {
      setError(describeInstallerError(cause));
    } finally {
      setIsInstalling(false);
    }
  }, [isInstalling]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-white">
      <p>Blast needs Node.js {MANAGED_NODE_VERSION} to run extensions.</p>

      {error !== null && (
        <p aria-live="assertive" className="max-w-lg text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <button
        aria-busy={isInstalling}
        className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
        disabled={isInstalling}
        onClick={() => void onInstall()}
        type="button"
      >
        {isInstalling ? "Installing…" : error === null ? "Install Node.js" : "Retry installation"}
      </button>

      {isInstalling && (
        <p aria-live="polite" className="text-sm text-white/70">
          Downloading and verifying the managed runtime…
        </p>
      )}
    </div>
  );
}

function describeInstallerError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Node.js installation failed. Please try again.";
}
