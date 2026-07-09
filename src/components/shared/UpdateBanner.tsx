import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, installUpdateAndRestart } from "../../api/updater";
import "./update-banner.css";

export default function UpdateBanner() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkForUpdate().then(setUpdate);
  }, []);

  if (!update || dismissed) return null;

  async function handleInstall() {
    if (!update) return;
    setInstalling(true);
    try {
      await installUpdateAndRestart(update, (downloaded, total) => {
        if (total) setProgress(Math.round((downloaded / total) * 100));
      });
    } catch {
      setInstalling(false);
    }
  }

  return (
    <div className="update-banner">
      <span>
        {installing
          ? `${t("update.installing")}${progress !== null ? ` (${progress}%)` : "…"}`
          : t("update.available", { version: update.version })}
      </span>
      {!installing && (
        <div className="update-banner-actions">
          <button className="secondary-button" onClick={handleInstall}>
            {t("update.installNow")}
          </button>
          <button className="dismiss-button" onClick={() => setDismissed(true)}>
            {t("update.later")}
          </button>
        </div>
      )}
    </div>
  );
}
