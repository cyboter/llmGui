mod commands;
mod config;
mod engine;
mod errors;
pub mod hardware;
mod models;

use commands::AppState;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
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
