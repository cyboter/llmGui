//! Modell-Registry (kuratierte Liste aus model-registry.json) und
//! Verwaltung eigener GGUF-Dateien im Erweiterten Modus.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelLicense {
    pub name: String,
    pub summary: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendedFor {
    #[serde(rename = "minRamGb")]
    pub min_ram_gb: u32,
    #[serde(rename = "minVramGb")]
    pub min_vram_gb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratedModel {
    pub id: String,
    pub label: String,
    pub description: String,
    pub source: String,
    pub quantization: String,
    #[serde(rename = "approxSizeBytes")]
    pub approx_size_bytes: u64,
    pub sha256: String,
    #[serde(rename = "downloadUrl")]
    pub download_url: String,
    pub license: ModelLicense,
    #[serde(rename = "recommendedFor")]
    pub recommended_for: RecommendedFor,
}

#[derive(Debug, Deserialize)]
struct ModelRegistryFile {
    models: Vec<CuratedModel>,
}

/// Lädt die kuratierte Modellliste aus der `model-registry.json`, die als
/// Tauri-Resource neben der Anwendung ausgeliefert wird. Das Manifest ist
/// bewusst außerhalb des Binaries gehalten, damit die Liste künftig auch
/// per Remote-Fetch (siehe Architekturplan) aktualisierbar ist, ohne ein
/// App-Update zu erfordern.
pub fn load_registry(path: &std::path::Path) -> Result<Vec<CuratedModel>, std::io::Error> {
    let content = std::fs::read_to_string(path)?;
    let parsed: ModelRegistryFile = serde_json::from_str(&content)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok(parsed.models)
}

/// Empfiehlt das größte kuratierte Modell, dessen Mindestanforderungen von
/// der erkannten Hardware erfüllt werden. Fällt auf das kleinste Modell
/// zurück, wenn keines der Anforderungsprofile erfüllt ist — der Nutzer
/// soll immer eine lauffähige Empfehlung bekommen.
pub fn recommend_model<'a>(
    models: &'a [CuratedModel],
    total_ram_bytes: u64,
    best_vram_bytes: u64,
) -> Option<&'a CuratedModel> {
    let ram_gb = (total_ram_bytes / (1024 * 1024 * 1024)) as u32;
    let vram_gb = (best_vram_bytes / (1024 * 1024 * 1024)) as u32;

    models
        .iter()
        .filter(|m| m.recommended_for.min_ram_gb <= ram_gb && m.recommended_for.min_vram_gb <= vram_gb)
        .max_by_key(|m| m.recommended_for.min_ram_gb)
        .or_else(|| models.iter().min_by_key(|m| m.approx_size_bytes))
}
