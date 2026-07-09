//! Erkennung von RAM, VRAM, GPU-Typ (CUDA/Vulkan/CPU-only) zur automatischen
//! Empfehlung von Modell, Quantisierung und Engine-Backend.

mod dxgi;
mod wmi_probe;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: GpuVendor,
    pub vram_bytes: u64,
}

/// Welche llama.cpp-Backend-Variante automatisch gewählt werden soll.
/// Reihenfolge der Bevorzugung ist in `recommend_backend` festgelegt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineBackend {
    Cuda,
    Vulkan,
    Cpu,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareProfile {
    pub total_ram_bytes: u64,
    pub cpu_threads: u32,
    pub gpus: Vec<GpuInfo>,
    pub recommended_backend: EngineBackend,
}

/// Erkennt die vorhandene Hardware. Schlägt eine einzelne Prüfung fehl
/// (z.B. WMI nicht verfügbar), wird auf konservative Defaults zurückgefallen
/// statt die gesamte Erkennung abzubrechen — der Nutzer soll nie mit einem
/// Fehler im Ersteinrichtungs-Flow hängen bleiben.
pub fn detect() -> HardwareProfile {
    let total_ram_bytes = wmi_probe::total_ram_bytes().unwrap_or(8 * 1024 * 1024 * 1024);
    let cpu_threads = std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(4);
    let gpus = dxgi::enumerate_gpus().unwrap_or_default();
    let recommended_backend = recommend_backend(&gpus);

    HardwareProfile {
        total_ram_bytes,
        cpu_threads,
        gpus,
        recommended_backend,
    }
}

/// Empfiehlt ein Backend nach Vorgabe aus dem Architekturplan:
/// NVIDIA + ausreichend VRAM -> CUDA, sonst wenn irgendeine erkannte GPU
/// existiert -> Vulkan (vendor-neutral, funktioniert auf AMD/NVIDIA/Intel),
/// keine GPU erkannt -> CPU.
fn recommend_backend(gpus: &[GpuInfo]) -> EngineBackend {
    const MIN_CUDA_VRAM_BYTES: u64 = 4 * 1024 * 1024 * 1024;

    let best_nvidia = gpus
        .iter()
        .filter(|g| g.vendor == GpuVendor::Nvidia)
        .max_by_key(|g| g.vram_bytes);

    if let Some(gpu) = best_nvidia {
        if gpu.vram_bytes >= MIN_CUDA_VRAM_BYTES {
            return EngineBackend::Cuda;
        }
    }

    if !gpus.is_empty() {
        return EngineBackend::Vulkan;
    }

    EngineBackend::Cpu
}
