//! Manueller Smoke-Test für die Hardware-Erkennung, unabhängig von der
//! Tauri-GUI ausführbar: `cargo run --example detect_hardware`.

fn main() {
    let profile = llm_gui_lib::hardware::detect();
    println!("{:#?}", profile);
}
