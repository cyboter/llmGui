//! GitHub-Releases-API-Client. Standardmäßig ggml-org/llama.cpp, im
//! Erweiterten Modus auf beliebige owner/repo-Forks umstellbar. Erkennt
//! Windows-Release-Assets nach dem Namensschema
//! `llama-<tag>-bin-win-<backend>-<arch>.zip`.

use crate::hardware::EngineBackend;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const DEFAULT_REPO: &str = "ggml-org/llama.cpp";

#[derive(Debug, Error)]
pub enum ReleaseSourceError {
    #[error("Netzwerkfehler beim Abrufen der Release-Informationen")]
    Network(#[from] reqwest::Error),
    #[error("Kein passendes Release-Asset für dieses Repo und Backend gefunden")]
    AssetNotFound,
    #[error("GitHub-API-Antwort konnte nicht gelesen werden")]
    InvalidResponse,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedAsset {
    pub tag: String,
    pub download_url: String,
    pub size_bytes: u64,
    /// Bei CUDA-Backend zusätzlich benötigtes Redistributable-Asset
    /// (`cudart-llama-bin-win-cuda-*.zip`), falls vorhanden.
    pub redistributable_url: Option<String>,
    pub redistributable_size_bytes: Option<u64>,
}

fn backend_slug(backend: EngineBackend) -> &'static str {
    match backend {
        EngineBackend::Cuda => "cuda",
        EngineBackend::Vulkan => "vulkan",
        EngineBackend::Cpu => "cpu",
    }
}

/// Findet unter den Release-Assets die Windows-x64-Zip-Datei, die zum
/// gewünschten Backend passt. CUDA-Namen enthalten eine zusätzliche
/// Toolkit-Version (z.B. `cuda-12.4`), daher wird per `contains` statt
/// exaktem Namensvergleich gematcht.
fn find_asset<'a>(assets: &'a [GitHubAsset], backend: EngineBackend) -> Option<&'a GitHubAsset> {
    let slug = backend_slug(backend);
    assets.iter().find(|a| {
        let n = a.name.to_lowercase();
        n.starts_with("llama-")
            && n.contains("-bin-win-")
            && n.contains(slug)
            && n.contains("x64")
            && n.ends_with(".zip")
            && !n.starts_with("cudart-")
    })
}

fn find_cudart_asset(assets: &[GitHubAsset]) -> Option<&GitHubAsset> {
    assets.iter().find(|a| {
        let n = a.name.to_lowercase();
        n.starts_with("cudart-llama-bin-win-cuda-") && n.ends_with("x64.zip")
    })
}

/// Löst das aktuellste Release für `repo` (Format `owner/repo`) auf und
/// gibt die Download-URL des zum Backend passenden Windows-Assets zurück.
pub async fn resolve_latest(
    client: &reqwest::Client,
    repo: &str,
    backend: EngineBackend,
) -> Result<ResolvedAsset, ReleaseSourceError> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let release: GitHubRelease = client
        .get(&url)
        .header("User-Agent", "llm-gui")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()
        .map_err(|_| ReleaseSourceError::InvalidResponse)?
        .json()
        .await
        .map_err(|_| ReleaseSourceError::InvalidResponse)?;

    let asset = find_asset(&release.assets, backend).ok_or(ReleaseSourceError::AssetNotFound)?;

    let (redistributable_url, redistributable_size_bytes) = if backend == EngineBackend::Cuda {
        match find_cudart_asset(&release.assets) {
            Some(a) => (Some(a.browser_download_url.clone()), Some(a.size)),
            None => (None, None),
        }
    } else {
        (None, None)
    };

    Ok(ResolvedAsset {
        tag: release.tag_name,
        download_url: asset.browser_download_url.clone(),
        size_bytes: asset.size,
        redistributable_url,
        redistributable_size_bytes,
    })
}
