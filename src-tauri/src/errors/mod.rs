//! Übersetzungsschicht: technische Fehler (Prozess-Exit-Codes, HTTP-Fehler,
//! OOM-Meldungen) werden auf stabile Fehlercodes gemappt, die das Frontend
//! über i18n in die aktuell gewählte Sprache übersetzt. `message` enthält
//! zusätzlich einen deutschsprachigen Fallback-Text für den Fall, dass ein
//! Frontend keine Übersetzung für den Code kennt.

use serde::Serialize;

/// Stabile Fehlercodes, die das Frontend auf i18n-Keys abbildet (siehe
/// `src/i18n/locales/*.json`, Namespace `errors.*`).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    GpuOutOfMemory,
    ModelLoadFailed,
    PortInUse,
    NoCudaDriver,
    StartupFailedGeneric,
    InsufficientDiskSpace,
    NetworkError,
    ChecksumMismatch,
    InvalidFileExtension,
    FileNotReadable,
}

/// Eine für Laien verständliche Fehlermeldung. `technical_detail` wird nur
/// im Erweiterten Modus / Log-Panel angezeigt, niemals im einfachen Modus.
#[derive(Debug, Clone, Serialize)]
pub struct FriendlyError {
    pub code: ErrorCode,
    pub message: String,
    pub technical_detail: String,
}

impl FriendlyError {
    pub fn new(code: ErrorCode, message: impl Into<String>, technical_detail: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            technical_detail: technical_detail.into(),
        }
    }
}

/// Wertet die letzten Log-Zeilen von `llama-server.exe` aus und übersetzt
/// bekannte Fehlerbilder in einen stabilen Fehlercode. Fällt auf einen
/// generischen Code zurück, wenn kein bekanntes Muster erkannt wird —
/// im einfachen Modus wird dann trotzdem nie ein Rohfehler angezeigt.
pub fn translate_startup_failure(recent_logs: &[String]) -> FriendlyError {
    let combined = recent_logs.join("\n");
    let lower = combined.to_lowercase();

    if lower.contains("out of memory") || lower.contains("cuda error") && lower.contains("memory")
    {
        return FriendlyError::new(
            ErrorCode::GpuOutOfMemory,
            "Deine Grafikkarte hat nicht genug Speicher für dieses Modell. Wir schalten automatisch auf einen langsameren, aber zuverlässigen Modus um.",
            combined,
        );
    }

    if lower.contains("failed to load model") || lower.contains("error loading model") {
        return FriendlyError::new(
            ErrorCode::ModelLoadFailed,
            "Die Modelldatei konnte nicht geladen werden. Sie ist möglicherweise beschädigt oder unvollständig heruntergeladen.",
            combined,
        );
    }

    if lower.contains("address already in use") || lower.contains("bind") {
        return FriendlyError::new(
            ErrorCode::PortInUse,
            "Der gewählte Port wird bereits von einem anderen Programm verwendet. Bitte wähle im Erweiterten Modus einen anderen Port.",
            combined,
        );
    }

    if lower.contains("no cuda") || lower.contains("cuda driver") {
        return FriendlyError::new(
            ErrorCode::NoCudaDriver,
            "Es konnte keine unterstützte NVIDIA-Grafikkarte gefunden werden. Wir wechseln in einen Modus, der ohne spezielle Grafikkartenunterstützung läuft.",
            combined,
        );
    }

    FriendlyError::new(
        ErrorCode::StartupFailedGeneric,
        "Das Sprachmodell konnte nicht gestartet werden. Wir versuchen es mit angepassten Einstellungen erneut.",
        combined,
    )
}

pub fn disk_space_error() -> FriendlyError {
    FriendlyError::new(
        ErrorCode::InsufficientDiskSpace,
        "Es ist nicht genug Speicherplatz auf deiner Festplatte frei. Bitte gib etwas Speicherplatz frei und versuche es erneut.",
        "insufficient disk space".to_string(),
    )
}

pub fn network_error(detail: impl Into<String>) -> FriendlyError {
    FriendlyError::new(
        ErrorCode::NetworkError,
        "Der Download konnte nicht abgeschlossen werden. Bitte prüfe deine Internetverbindung und versuche es erneut.",
        detail.into(),
    )
}

pub fn checksum_error() -> FriendlyError {
    FriendlyError::new(
        ErrorCode::ChecksumMismatch,
        "Die heruntergeladene Datei scheint beschädigt zu sein. Wir versuchen den Download erneut.",
        "sha256 checksum mismatch".to_string(),
    )
}
