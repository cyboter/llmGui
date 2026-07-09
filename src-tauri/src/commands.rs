//! Tauri-Commands: die einzige Schnittstelle, über die das Frontend mit
//! Hardware-Erkennung, Engine-Setup und Server-Lifecycle interagiert.

use crate::config::ServerConfig;
use crate::engine::{self, downloader, downloader::DownloadProgress, process::ServerProcess};
use crate::errors::{self, FriendlyError};
use crate::hardware::{self, HardwareProfile};
use crate::models::{self, CuratedModel};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;

pub struct AppState {
    pub server: Arc<Mutex<ServerProcess>>,
    pub http_client: reqwest::Client,
    pub install_root: PathBuf,
    pub models_root: PathBuf,
}

#[derive(Debug, Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
}

#[tauri::command]
pub fn detect_hardware() -> HardwareProfile {
    hardware::detect()
}

#[tauri::command]
pub fn load_curated_models(app: tauri::AppHandle) -> Result<Vec<CuratedModel>, String> {
    let resource_path = app
        .path()
        .resolve("model-registry.json", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    models::load_registry(&resource_path)
        .map_err(|e| format!("{e} (Pfad: {})", resource_path.display()))
}

#[tauri::command]
pub fn recommend_model(
    models: Vec<CuratedModel>,
    total_ram_bytes: u64,
    best_vram_bytes: u64,
) -> Option<CuratedModel> {
    models::recommend_model(&models, total_ram_bytes, best_vram_bytes).cloned()
}

/// Lädt die Engine (falls nötig) herunter und sendet währenddessen
/// `engine-download-progress`-Events ans Frontend für die Fortschrittsanzeige
/// im Onboarding.
#[tauri::command]
pub async fn ensure_engine(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo: Option<String>,
    backend: hardware::EngineBackend,
) -> Result<String, FriendlyError> {
    let install_root = state.install_root.clone();
    let client = state.http_client.clone();
    let app_for_progress = app.clone();
    let repo = repo.unwrap_or_else(|| engine::release_source::DEFAULT_REPO.to_string());

    let exe_path = engine::ensure_engine_installed(
        &client,
        &install_root,
        &repo,
        backend,
        move |progress: DownloadProgress| {
            let _ = app_for_progress.emit("engine-download-progress", &progress);
        },
    )
    .await?;

    Ok(exe_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn start_server(
    state: State<'_, AppState>,
    exe_path: String,
    config: ServerConfig,
    max_gpu_layers: u32,
) -> Result<(), FriendlyError> {
    let mut server = state.server.lock().await;
    engine::start_with_retry(&mut server, &PathBuf::from(exe_path), &config, max_gpu_layers).await
}

/// Lädt eine kuratierte Modelldatei herunter (falls noch nicht vorhanden),
/// prüft die SHA256-Checksumme und sendet währenddessen
/// `model-download-progress`-Events für die Fortschrittsanzeige im
/// Onboarding. Gibt den lokalen Pfad zur GGUF-Datei zurück.
#[tauri::command]
pub async fn download_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    model: CuratedModel,
) -> Result<String, FriendlyError> {
    let dest = state.models_root.join(format!("{}.gguf", model.id));

    if dest.exists() {
        if downloader::verify_sha256(&dest, &model.sha256).is_ok() {
            return Ok(dest.to_string_lossy().to_string());
        }
        // Beschädigte/unvollständige Vorgänger-Datei verwerfen und neu laden.
        let _ = std::fs::remove_file(&dest);
    }

    let client = state.http_client.clone();
    let app_for_progress = app.clone();

    downloader::download_resumable(
        &client,
        &model.download_url,
        &dest,
        model.approx_size_bytes,
        move |progress: DownloadProgress| {
            let _ = app_for_progress.emit("model-download-progress", &progress);
        },
    )
    .await
    .map_err(|e| match e {
        downloader::DownloadError::InsufficientDiskSpace => errors::disk_space_error(),
        other => errors::network_error(other.to_string()),
    })?;

    if downloader::verify_sha256(&dest, &model.sha256).is_err() {
        let _ = std::fs::remove_file(&dest);
        return Err(errors::checksum_error());
    }

    Ok(dest.to_string_lossy().to_string())
}

#[derive(Debug, Serialize)]
pub struct CustomModelInfo {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
}

/// Validiert eine vom Nutzer über den Dateidialog ausgewählte GGUF-Datei
/// (Erweiterter Modus). Prüft nur Existenz, Endung und Lesbarkeit — die
/// eigentliche Modellwahl/-verwaltung passiert im Frontend, da hierfür
/// keine serverseitige Persistenz nötig ist (der Pfad wird direkt in
/// ServerConfig.model_path verwendet).
#[tauri::command]
pub fn validate_custom_model(path: String) -> Result<CustomModelInfo, FriendlyError> {
    let path_buf = PathBuf::from(&path);

    if path_buf.extension().and_then(|e| e.to_str()) != Some("gguf") {
        return Err(FriendlyError::new(
            errors::ErrorCode::InvalidFileExtension,
            "Diese Datei ist keine GGUF-Modelldatei. Bitte wähle eine Datei mit der Endung .gguf.",
            format!("unexpected extension for {path}"),
        ));
    }

    let metadata = std::fs::metadata(&path_buf).map_err(|e| {
        FriendlyError::new(
            errors::ErrorCode::FileNotReadable,
            "Die ausgewählte Datei konnte nicht gelesen werden.",
            e.to_string(),
        )
    })?;

    let file_name = path_buf
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(CustomModelInfo {
        path,
        file_name,
        size_bytes: metadata.len(),
    })
}

#[tauri::command]
pub async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
    let mut server = state.server.lock().await;
    server.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let mut server = state.server.lock().await;
    Ok(ServerStatus {
        running: server.is_running(),
        port: server.port,
    })
}

#[tauri::command]
pub async fn server_logs(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let server = state.server.lock().await;
    Ok(server.recent_logs().await)
}
