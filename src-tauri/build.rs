use std::path::Path;

fn main() {
    // Im `tauri build` wird `resources` aus tauri.conf.json automatisch neben
    // die fertige exe kopiert. Im `tauri dev` passiert das nicht — dort sucht
    // Tauris resource_dir()-Auflösung direkt im target/<profile>-Ordner.
    // Damit `model-registry.json` in beiden Modi gefunden wird, kopieren wir
    // sie hier manuell mit.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let src = Path::new(&manifest_dir).join("../model-registry.json");
    let out_dir = std::env::var("OUT_DIR").unwrap();
    // OUT_DIR liegt immer unter target/<profile>/build/<crate>-<hash>/out;
    // drei Ebenen hoch landet man bei target/<profile>, wo Tauris
    // resource_dir()-Auflösung im Dev-Modus sucht.
    if let Some(target_profile_dir) = Path::new(&out_dir).ancestors().nth(3) {
        let dest = target_profile_dir.join("model-registry.json");
        let _ = std::fs::copy(&src, &dest);
    }

    println!("cargo:rerun-if-changed=../model-registry.json");

    tauri_build::build()
}
