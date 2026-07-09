//! Abfrage von Systeminformationen (RAM) über WMI (Win32_ComputerSystem).

use serde::Deserialize;
use wmi::{COMLibrary, WMIConnection};

#[derive(Deserialize, Debug)]
#[serde(rename = "Win32_ComputerSystem")]
#[serde(rename_all = "PascalCase")]
struct ComputerSystem {
    total_physical_memory: u64,
}

pub fn total_ram_bytes() -> Option<u64> {
    let com_con = COMLibrary::new().ok()?;
    let wmi_con = WMIConnection::new(com_con).ok()?;
    let results: Vec<ComputerSystem> = wmi_con.query().ok()?;
    results.into_iter().next().map(|r| r.total_physical_memory)
}
