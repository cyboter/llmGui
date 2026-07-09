//! Verwaltung des llama-server-Subprozesses: Release-Auflösung, Download,
//! Start/Stop/Health-Überwachung sowie die Fehler-Retry-Kaskade beim Start.

pub mod downloader;
pub mod process;
pub mod release_source;

use crate::config::ServerConfig;
use crate::errors::{self, FriendlyError};
use crate::hardware::EngineBackend;
use process::ServerProcess;
use std::path::PathBuf;

/// Schrittweise Reduktion der GPU-Layer-Anzahl, bis der Server erfolgreich
/// startet. llama.cpp bietet keine Möglichkeit, VRAM-Bedarf vor dem Laden
/// zu prüfen (bestätigt durch Recherche der Server-API) — daher wird der
/// Fit empirisch per Retry ermittelt statt vorab berechnet.
const GPU_LAYER_RETRY_STEPS: &[f32] = &[1.0, 0.5, 0.25, 0.0];

/// Versucht den Server zu starten; schlägt der Start fehl (z.B. wegen zu
/// wenig VRAM), wird die GPU-Layer-Anzahl schrittweise reduziert und erneut
/// versucht, bis hin zu reinem CPU-Betrieb. Gibt bei endgültigem Scheitern
/// eine laienverständliche Fehlermeldung zurück statt eines Rohfehlers.
pub async fn start_with_retry(
    server: &mut ServerProcess,
    exe_path: &PathBuf,
    base_config: &ServerConfig,
    max_gpu_layers: u32,
) -> Result<(), FriendlyError> {
    let mut last_logs: Vec<String> = Vec::new();

    for fraction in GPU_LAYER_RETRY_STEPS {
        let mut attempt_config = base_config.clone();
        attempt_config.gpu_layers = ((max_gpu_layers as f32) * fraction).round() as u32;

        match server.start(exe_path, &attempt_config).await {
            Ok(()) => return Ok(()),
            Err(_) => {
                last_logs = server.recent_logs().await;
                server.stop().await;
                continue;
            }
        }
    }

    Err(errors::translate_startup_failure(&last_logs))
}

/// Lädt (falls noch nicht vorhanden) die zum Backend passende
/// `llama-server.exe` aus dem konfigurierten Repository herunter und gibt
/// den Pfad zur ausführbaren Datei zurück.
pub async fn ensure_engine_installed(
    client: &reqwest::Client,
    install_root: &PathBuf,
    repo: &str,
    backend: EngineBackend,
    on_progress: impl FnMut(downloader::DownloadProgress) + Send,
) -> Result<PathBuf, FriendlyError> {
    let resolved = release_source::resolve_latest(client, repo, backend)
        .await
        .map_err(|e| errors::network_error(e.to_string()))?;

    let engine_dir = install_root.join(&resolved.tag).join(format!("{backend:?}"));
    let exe_path = engine_dir.join("llama-server.exe");

    if exe_path.exists() {
        return Ok(exe_path);
    }

    let zip_path = install_root.join(format!("_download_{}.zip", resolved.tag));
    downloader::download_resumable(
        client,
        &resolved.download_url,
        &zip_path,
        resolved.size_bytes,
        on_progress,
    )
    .await
    .map_err(|e| match e {
        downloader::DownloadError::InsufficientDiskSpace => errors::disk_space_error(),
        downloader::DownloadError::ChecksumMismatch => errors::checksum_error(),
        other => errors::network_error(other.to_string()),
    })?;

    downloader::extract_zip(&zip_path, &engine_dir)
        .map_err(|e| errors::network_error(e.to_string()))?;

    // CUDA benötigt zusätzlich die separat ausgelieferte Runtime
    // (cudart-llama-bin-win-cuda-*.zip); ohne diese startet der Server nicht.
    if let Some(redist_url) = resolved.redistributable_url {
        let redist_zip = install_root.join(format!("_download_{}_cudart.zip", resolved.tag));
        downloader::download_resumable(
            client,
            &redist_url,
            &redist_zip,
            resolved.redistributable_size_bytes.unwrap_or(0),
            |_| {},
        )
        .await
        .map_err(|e| errors::network_error(e.to_string()))?;

        downloader::extract_zip(&redist_zip, &engine_dir)
            .map_err(|e| errors::network_error(e.to_string()))?;

        let _ = std::fs::remove_file(&redist_zip);
    }

    let _ = std::fs::remove_file(&zip_path);

    Ok(exe_path)
}
