mod commands;
mod config;
mod engine;
mod errors;
pub mod hardware;
mod models;

use commands::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Manager, WindowEvent};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_local_data_dir()
                .expect("app_local_data_dir sollte immer verfügbar sein");

            app.manage(AppState {
                server: Arc::new(Mutex::new(engine::process::ServerProcess::new())),
                http_client: reqwest::Client::new(),
                install_root: app_data_dir.join("engine"),
                models_root: app_data_dir.join("models"),
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Ohne diesen Handler bliebe llama-server.exe verwaist im
            // Hintergrund laufen, wenn die App per Fenster-X geschlossen
            // wird — `kill_on_drop` greift nur beim regulären Rust-Drop des
            // Prozess-Handles, nicht zuverlässig bei jedem Schließpfad.
            //
            // block_on() wäre hier riskant (potenzieller Deadlock/Panic,
            // falls der Callback bereits auf einem Tokio-Runtime-Thread
            // läuft) — stattdessen wird der Schließvorgang einmalig
            // verzögert, bis der Server asynchron gestoppt wurde.
            if let WindowEvent::CloseRequested { api, .. } = event {
                static CLEANUP_DONE: AtomicBool = AtomicBool::new(false);

                if CLEANUP_DONE.load(Ordering::SeqCst) {
                    return;
                }

                api.prevent_close();

                let window = window.clone();
                let state = window.state::<AppState>();
                let server = state.server.clone();

                tauri::async_runtime::spawn(async move {
                    server.lock().await.stop().await;
                    CLEANUP_DONE.store(true, Ordering::SeqCst);
                    let _ = window.close();
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::detect_hardware,
            commands::load_curated_models,
            commands::recommend_model,
            commands::ensure_engine,
            commands::download_model,
            commands::validate_custom_model,
            commands::start_server,
            commands::stop_server,
            commands::server_status,
            commands::server_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
