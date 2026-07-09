//! Resume-fähiger Download von Engine-Binaries und Modellen inkl.
//! SHA256-Prüfsummen-Validierung und Zip-Entpacken.

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Error)]
pub enum DownloadError {
    #[error("Netzwerkfehler beim Herunterladen")]
    Network(#[from] reqwest::Error),
    #[error("Dateisystemfehler")]
    Io(#[from] std::io::Error),
    #[error("Nicht genug freier Speicherplatz auf der Festplatte")]
    InsufficientDiskSpace,
    #[allow(dead_code)] // wird in Phase 2 beim Modell-Download über verify_sha256 ausgelöst
    #[error("Die heruntergeladene Datei ist beschädigt (Prüfsumme stimmt nicht überein)")]
    ChecksumMismatch,
    #[error("Fehler beim Entpacken der Archivdatei")]
    Extract(#[from] zip::result::ZipError),
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// Prüft, ob am Zielpfad voraussichtlich genug Platz für `needed_bytes` ist.
/// Bei Unsicherheit (API nicht verfügbar) wird optimistisch `true`
/// zurückgegeben, damit die Erkennung selbst niemals blockiert.
pub fn has_enough_disk_space(target_dir: &Path, needed_bytes: u64) -> bool {
    match fs4::available_space(target_dir) {
        Ok(available) => available > needed_bytes + 512 * 1024 * 1024, // 512 MB Puffer
        Err(_) => true,
    }
}

/// Lädt `url` nach `dest` herunter. Existiert bereits eine unvollständige
/// Datei an `dest`, wird der Download per HTTP-Range-Request fortgesetzt.
/// Ruft `on_progress` bei jedem empfangenen Chunk auf.
pub async fn download_resumable(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    total_bytes_hint: u64,
    mut on_progress: impl FnMut(DownloadProgress) + Send,
) -> Result<(), DownloadError> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
        if !has_enough_disk_space(parent, total_bytes_hint) {
            return Err(DownloadError::InsufficientDiskSpace);
        }
    }

    let mut downloaded: u64 = match tokio::fs::metadata(dest).await {
        Ok(meta) => meta.len(),
        Err(_) => 0,
    };

    let mut request = client.get(url);
    if downloaded > 0 {
        request = request.header("Range", format!("bytes={downloaded}-"));
    }

    let response = request.send().await?.error_for_status()?;
    let total_bytes = response
        .content_length()
        .map(|len| len + downloaded)
        .unwrap_or(total_bytes_hint);

    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dest)
        .await?;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        on_progress(DownloadProgress {
            downloaded_bytes: downloaded,
            total_bytes,
        });
    }

    file.flush().await?;
    Ok(())
}

/// Berechnet den SHA256-Hash einer Datei und vergleicht ihn (case-insensitiv)
/// mit `expected_hex`. Ein leerer `expected_hex`-String überspringt die
/// Prüfung (z.B. wenn für ein Asset noch keine Prüfsumme hinterlegt ist).
/// Engine-Releases von GitHub liefern keine Prüfsummen mit — verwendet wird
/// dies ab Phase 2 für den Download der GGUF-Modelldateien.
#[allow(dead_code)]
pub fn verify_sha256(path: &Path, expected_hex: &str) -> Result<(), DownloadError> {
    if expected_hex.is_empty() {
        return Ok(());
    }

    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    let actual = hex_encode(&hasher.finalize());

    if actual.eq_ignore_ascii_case(expected_hex) {
        Ok(())
    } else {
        Err(DownloadError::ChecksumMismatch)
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Entpackt ein Zip-Archiv nach `dest_dir`. Wird u.a. für Engine-Releases
/// verwendet, bei denen (im CUDA-Fall) das Haupt-Asset und das
/// Redistributable-Zip in denselben Ordner entpackt werden müssen.
pub fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<(), DownloadError> {
    std::fs::create_dir_all(dest_dir)?;
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let out_path: PathBuf = match entry.enclosed_name() {
            Some(p) => dest_dir.join(p),
            None => continue,
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out_file = std::fs::File::create(&out_path)?;
        std::io::copy(&mut entry, &mut out_file)?;
        out_file.flush()?;
    }

    Ok(())
}
