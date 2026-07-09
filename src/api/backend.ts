import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  CuratedModel,
  CustomModelInfo,
  DownloadProgress,
  EngineBackend,
  HardwareProfile,
  ServerConfig,
  ServerStatus,
} from "./types";

export function detectHardware(): Promise<HardwareProfile> {
  return invoke("detect_hardware");
}

export function loadCuratedModels(): Promise<CuratedModel[]> {
  return invoke("load_curated_models");
}

export function recommendModel(
  models: CuratedModel[],
  totalRamBytes: number,
  bestVramBytes: number,
): Promise<CuratedModel | null> {
  return invoke("recommend_model", {
    models,
    totalRamBytes,
    bestVramBytes,
  });
}

export function ensureEngine(
  backend: EngineBackend,
  repo?: string,
): Promise<string> {
  return invoke("ensure_engine", { backend, repo: repo ?? null });
}

export function downloadModel(model: CuratedModel): Promise<string> {
  return invoke("download_model", { model });
}

export function startServer(
  exePath: string,
  config: ServerConfig,
  maxGpuLayers: number,
): Promise<void> {
  return invoke("start_server", {
    exePath,
    config,
    maxGpuLayers,
  });
}

export function stopServer(): Promise<void> {
  return invoke("stop_server");
}

export function serverStatus(): Promise<ServerStatus> {
  return invoke("server_status");
}

export function serverLogs(): Promise<string[]> {
  return invoke("server_logs");
}

export function validateCustomModel(path: string): Promise<CustomModelInfo> {
  return invoke("validate_custom_model", { path });
}

/// Öffnet den nativen Dateiauswahl-Dialog für GGUF-Dateien. Gibt `null`
/// zurück, wenn der Nutzer abbricht.
export async function pickGgufFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "GGUF-Modell", extensions: ["gguf"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export function onEngineDownloadProgress(
  callback: (progress: DownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>("engine-download-progress", (event) =>
    callback(event.payload),
  );
}

export function onModelDownloadProgress(
  callback: (progress: DownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>("model-download-progress", (event) =>
    callback(event.payload),
  );
}
