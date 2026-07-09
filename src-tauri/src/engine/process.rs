//! Lifecycle des llama-server-Kindprozesses: Start, Health-Polling
//! (GET /health), Log-Capture, sauberes Beenden.

use crate::config::ServerConfig;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[derive(Debug, Error)]
pub enum ProcessError {
    #[error("llama-server.exe konnte nicht gestartet werden")]
    SpawnFailed(#[from] std::io::Error),
    #[error("Der Server hat innerhalb der erwarteten Zeit nicht geantwortet")]
    HealthTimeout,
    #[error("Netzwerkfehler bei der Kommunikation mit dem Server")]
    Network(#[from] reqwest::Error),
}

const MAX_LOG_LINES: usize = 500;
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(500);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(120);

/// Hält den laufenden Kindprozess sowie den zirkulären Log-Puffer für die
/// Anzeige im Erweiterten Modus. Wird als Tauri-State per `Arc<Mutex<..>>`
/// gehalten, damit Start/Stop/Status aus mehreren Commands heraus sicher
/// zugreifen können.
pub struct ServerProcess {
    child: Option<Child>,
    pub port: u16,
    logs: Arc<Mutex<Vec<String>>>,
}

impl ServerProcess {
    pub fn new() -> Self {
        Self {
            child: None,
            port: 0,
            logs: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn is_running(&mut self) -> bool {
        match &mut self.child {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        }
    }

    /// Startet `llama-server.exe` mit der gegebenen Konfiguration und wartet
    /// (per Polling gegen `/health`) bis er entweder bereit ist oder das
    /// Timeout erreicht wird. stdout/stderr werden in den Log-Puffer
    /// gestreamt statt verworfen zu werden — wichtig für das Log-Panel im
    /// Erweiterten Modus und für Fehlerdiagnose in der Retry-Kaskade.
    pub async fn start(
        &mut self,
        exe_path: &PathBuf,
        config: &ServerConfig,
    ) -> Result<(), ProcessError> {
        self.stop().await;

        let mut child = Command::new(exe_path)
            .args(config.to_args())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()?;

        self.logs.lock().await.clear();

        if let Some(stdout) = child.stdout.take() {
            spawn_log_reader(stdout, self.logs.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_log_reader(stderr, self.logs.clone());
        }

        self.port = config.port;
        self.child = Some(child);

        self.wait_until_healthy().await
    }

    async fn wait_until_healthy(&mut self) -> Result<(), ProcessError> {
        let client = reqwest::Client::new();
        let health_url = format!("http://127.0.0.1:{}/health", self.port);
        let deadline = tokio::time::Instant::now() + HEALTH_TIMEOUT;

        while tokio::time::Instant::now() < deadline {
            // Falls der Prozess in der Zwischenzeit abgestürzt ist (z.B. OOM
            // beim Laden), sofort abbrechen statt bis zum Timeout zu warten —
            // die Retry-Kaskade in engine/mod.rs kann so schneller reagieren.
            if !self.is_running() {
                return Err(ProcessError::HealthTimeout);
            }

            if let Ok(resp) = client.get(&health_url).send().await {
                if resp.status().is_success() {
                    return Ok(());
                }
            }

            tokio::time::sleep(HEALTH_POLL_INTERVAL).await;
        }

        Err(ProcessError::HealthTimeout)
    }

    /// Beendet den Server sauber. `kill_on_drop` dient nur als Fallback für
    /// den Fall eines App-Absturzes; der reguläre Pfad hier ruft `kill()`
    /// explizit auf, damit der Port sofort wieder frei ist.
    pub async fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }
    }

    pub async fn recent_logs(&self) -> Vec<String> {
        self.logs.lock().await.clone()
    }
}

fn spawn_log_reader<R>(reader: R, logs: Arc<Mutex<Vec<String>>>)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let mut buf = logs.lock().await;
            buf.push(line);
            if buf.len() > MAX_LOG_LINES {
                let overflow = buf.len() - MAX_LOG_LINES;
                buf.drain(0..overflow);
            }
        }
    });
}
