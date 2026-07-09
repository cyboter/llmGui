//! Abfrage des Gesamtarbeitsspeichers über die Win32-API `GlobalMemoryStatusEx`.
//!
//! Bewusst ohne WMI/COM implementiert: WMI erfordert COM-Initialisierung
//! (`CoInitializeEx`) auf dem aufrufenden Thread, was in Tauri-Commands zu
//! stillen Fehlschlägen führt, wenn der Tokio-Worker-Thread bereits mit
//! einem anderen COM-Apartment-Modell initialisiert wurde (z.B. durch
//! WebView2). `GlobalMemoryStatusEx` ist eine reine Win32-API ohne
//! COM-Abhängigkeit und daher robust in jedem Thread-Kontext aufrufbar.

use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

pub fn total_ram_bytes() -> Option<u64> {
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };

    // SAFETY: `status` ist korrekt mit `dwLength` initialisiert, wie von der
    // WinAPI gefordert; der Aufruf schreibt nur in dieses lokale struct.
    unsafe { GlobalMemoryStatusEx(&mut status).ok()? };

    Some(status.ullTotalPhys)
}
