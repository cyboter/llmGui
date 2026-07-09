import type { ServerConfig } from "../api/types";

const SETUP_COMPLETE_KEY = "llmgui.setupComplete";
const SERVER_CONFIG_KEY = "llmgui.serverConfig";
const EXE_PATH_KEY = "llmgui.exePath";
const MAX_GPU_LAYERS_KEY = "llmgui.maxGpuLayers";

export function isSetupComplete(): boolean {
  return localStorage.getItem(SETUP_COMPLETE_KEY) === "true";
}

export function markSetupComplete(): void {
  localStorage.setItem(SETUP_COMPLETE_KEY, "true");
}

export function resetSetup(): void {
  localStorage.removeItem(SETUP_COMPLETE_KEY);
}

export function saveServerSetup(
  exePath: string,
  config: ServerConfig,
  maxGpuLayers: number,
): void {
  localStorage.setItem(EXE_PATH_KEY, exePath);
  localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(MAX_GPU_LAYERS_KEY, String(maxGpuLayers));
}

export function loadServerSetup(): {
  exePath: string;
  config: ServerConfig;
  maxGpuLayers: number;
} | null {
  const exePath = localStorage.getItem(EXE_PATH_KEY);
  const configRaw = localStorage.getItem(SERVER_CONFIG_KEY);
  const maxGpuLayersRaw = localStorage.getItem(MAX_GPU_LAYERS_KEY);
  if (!exePath || !configRaw || !maxGpuLayersRaw) return null;

  try {
    return {
      exePath,
      config: JSON.parse(configRaw) as ServerConfig,
      maxGpuLayers: Number(maxGpuLayersRaw),
    };
  } catch {
    return null;
  }
}
