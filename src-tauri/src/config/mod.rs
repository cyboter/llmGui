//! Persistierte Nutzer-Einstellungen (einfacher/erweiterter Modus,
//! Inferenzparameter, Server-Port, Engine-Quelle).

use serde::{Deserialize, Serialize};

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
