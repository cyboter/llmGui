//! Persistierte Nutzer-Einstellungen (einfacher/erweiterter Modus,
//! Inferenzparameter, Server-Port, Engine-Quelle).

use serde::{Deserialize, Serialize};

/// Quantisierungsstufe für den KV-Cache (Kontext-Zwischenspeicher) von
/// llama-server. f16 ist der Standard (volle Genauigkeit), q8_0/q4_0
/// reduzieren den Speicherbedarf auf Kosten der Antwortqualität.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CacheType {
    #[serde(rename = "f16")]
    F16,
    #[serde(rename = "q8_0")]
    Q80,
    #[serde(rename = "q4_0")]
    Q40,
}

impl Default for CacheType {
    fn default() -> Self {
        CacheType::F16
    }
}

impl CacheType {
    fn as_cli_value(self) -> &'static str {
        match self {
            CacheType::F16 => "f16",
            CacheType::Q80 => "q8_0",
            CacheType::Q40 => "q4_0",
        }
    }
}

/// Parameter, mit denen `llama-server.exe` gestartet wird. Im einfachen
/// Modus werden diese automatisch aus der Hardware-Erkennung und der
/// Modell-Registry abgeleitet, ohne dass der Nutzer sie je sieht. Im
/// Erweiterten Modus sind alle Felder manuell editierbar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub model_path: String,
    pub port: u16,
    pub context_size: u32,
    pub gpu_layers: u32,
    pub threads: u32,
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: u32,
    pub repeat_penalty: f32,
    pub system_prompt: Option<String>,
    // `default`, damit Configs, die vor Einführung der KV-Cache-
    // Quantisierung lokal gespeichert wurden, ohne Absturz weiter
    // deserialisiert werden können (fällt auf f16 zurück).
    #[serde(default)]
    pub cache_type_k: CacheType,
    #[serde(default)]
    pub cache_type_v: CacheType,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            model_path: String::new(),
            port: 8080,
            context_size: 4096,
            gpu_layers: 0,
            threads: std::thread::available_parallelism()
                .map(|n| n.get() as u32)
                .unwrap_or(4),
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
            repeat_penalty: 1.1,
            system_prompt: None,
            cache_type_k: CacheType::F16,
            cache_type_v: CacheType::F16,
        }
    }
}

impl ServerConfig {
    /// Baut die CLI-Argumente für `llama-server.exe` aus dieser Konfiguration.
    pub fn to_args(&self) -> Vec<String> {
        let mut args = vec![
            "--model".to_string(),
            self.model_path.clone(),
            "--port".to_string(),
            self.port.to_string(),
            "--ctx-size".to_string(),
            self.context_size.to_string(),
            "--n-gpu-layers".to_string(),
            self.gpu_layers.to_string(),
            "--threads".to_string(),
            self.threads.to_string(),
            "--cache-type-k".to_string(),
            self.cache_type_k.as_cli_value().to_string(),
            "--cache-type-v".to_string(),
            self.cache_type_v.as_cli_value().to_string(),
        ];

        if let Some(prompt) = &self.system_prompt {
            if !prompt.is_empty() {
                args.push("--system-prompt".to_string());
                args.push(prompt.clone());
            }
        }

        args
    }
}
