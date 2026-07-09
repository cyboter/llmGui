//! Tauri-Commands: die einzige Schnittstelle, über die das Frontend mit
//! Hardware-Erkennung, Engine-Setup und Server-Lifecycle interagiert.

use crate::config::ServerConfig;
use crate::engine::{self, downloader::DownloadProgress, process::ServerProcess};
use crate::errors::FriendlyError;
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
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("model-registry.json");
    models::load_registry(&resource_path).map_err(|e| e.to_string())
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
