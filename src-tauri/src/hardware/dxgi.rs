//! GPU-Enumeration über DXGI: Name, Hersteller (via PCI-Vendor-ID) und
//! dedizierter Grafikspeicher. Funktioniert ohne installierte
//! Vendor-spezifische Treiber-Tools (nur der normale Grafiktreiber wird
//! vorausgesetzt).

use super::{GpuInfo, GpuVendor};
use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1};

const VENDOR_NVIDIA: u32 = 0x10DE;
const VENDOR_AMD: u32 = 0x1002;
const VENDOR_INTEL: u32 = 0x8086;

fn vendor_from_id(id: u32) -> GpuVendor {
    match id {
        VENDOR_NVIDIA => GpuVendor::Nvidia,
        VENDOR_AMD => GpuVendor::Amd,
        VENDOR_INTEL => GpuVendor::Intel,
        _ => GpuVendor::Unknown,
    }
}

pub fn enumerate_gpus() -> Option<Vec<GpuInfo>> {
    // SAFETY: DXGI-Aufrufe sind reine COM-Interop-Calls; alle Rückgabewerte
    // werden vor Nutzung auf Erfolg geprüft. Kein Zugriff auf rohe Zeiger
    // über die windows-crate-Wrapper hinaus.
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().ok()?;
        let mut gpus = Vec::new();
        let mut i = 0u32;
        loop {
            let adapter = match factory.EnumAdapters1(i) {
                Ok(a) => a,
                Err(_) => break,
            };
            i += 1;

            let desc = match adapter.GetDesc1() {
                Ok(d) => d,
                Err(_) => continue,
            };

            // Software-Adapter (z.B. Microsoft Basic Render Driver) überspringen.
            if desc.Flags & 2 != 0 {
                continue;
            }

            let name = String::from_utf16_lossy(
                &desc.Description[..desc
                    .Description
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(desc.Description.len())],
            );

            gpus.push(GpuInfo {
                name,
                vendor: vendor_from_id(desc.VendorId),
                vram_bytes: desc.DedicatedVideoMemory as u64,
            });
        }
        Some(gpus)
    }
}
