import { useCallback, useState } from "react";

export default function App() {
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  const onInstall = useCallback(() => {
    if (isInstalling) {
      return;
    }

    setError(null);
    setIsInstalling(true);

    window.electron
      .startNodeInstallation()
      .then((success) => {
        if (!success) {
          setError("Installation failed");
        }

        window.electron.exitAndStart();
      })
      .catch((error) => {
        setError(error.message);
      })
      .finally(() => {
        setIsInstalling(false);
      });
  }, []);

  return (
    <div className="flex justify-center items-center text-white h-full flex-col gap-2">
      {!isInstalling && (
        <>
          <p>You have to install the nodejs runtime to use this app. Click the button below to proceed.</p>

          <button className="py-2 px-4 font-bold text-white bg-blue-500 rounded hover:bg-blue-700" onClick={onInstall}>
            Install NodeJS
          </button>
        </>
      )}

      {isInstalling && <p>Installing...</p>}
    </div>
  );
}
