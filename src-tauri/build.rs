fn main() {
    let inject_path = std::path::Path::new("../dist/inject.js");
    if !inject_path.exists() {
        if let Some(parent) = inject_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(inject_path, "");
    }
    tauri_build::build()
}
