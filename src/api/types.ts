export type GpuVendor = "nvidia" | "amd" | "intel" | "unknown";

export interface GpuInfo {
  name: string;
  vendor: GpuVendor;
  vram_bytes: number;
}

export type EngineBackend = "cuda" | "vulkan" | "cpu";

export interface HardwareProfile {
  total_ram_bytes: number;
  cpu_threads: number;
  gpus: GpuInfo[];
  recommended_backend: EngineBackend;
}

export interface ModelLicense {
  name: string;
  summary: string;
  url: string;
}

export interface RecommendedFor {
  minRamGb: number;
  minVramGb: number;
}

export interface CuratedModel {
  id: string;
  label: string;
  description: string;
  source: string;
  quantization: string;
  approxSizeBytes: number;
  sha256: string;
  downloadUrl: string;
  license: ModelLicense;
  recommendedFor: RecommendedFor;
}

export interface DownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
}

export interface ServerConfig {
  model_path: string;
  port: number;
  context_size: number;
  gpu_layers: number;
  threads: number;
  temperature: number;
  top_p: number;
  top_k: number;
  repeat_penalty: number;
  system_prompt: string | null;
}

export interface ServerStatus {
  running: boolean;
  port: number;
}

export interface CustomModelInfo {
  path: string;
  file_name: string;
  size_bytes: number;
}

export interface FriendlyError {
  message: string;
  technical_detail: string;
}

export function isFriendlyError(e: unknown): e is FriendlyError {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    "technical_detail" in e
  );
}
