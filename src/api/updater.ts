import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch {
    // Kein Update-Server erreichbar oder kein Update verfügbar — im
    // einfachen wie im erweiterten Modus soll das nie als Fehler auffallen,
    // da Update-Prüfungen rein optional sind.
    return null;
  }
}

export async function installUpdateAndRestart(
  update: Update,
  onProgress?: (downloaded: number, total: number | undefined) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.(downloaded, total);
    }
  });

  await relaunch();
}
