use std::fs;

// El diálogo elige la ruta; este comando solo escribe los bytes que devuelve
// la ficha o el CSV. Evita dar al frontend acceso libre al sistema de archivos.
#[tauri::command]
fn save_binary(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, data).map_err(|e| format!("No se pudo guardar {path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_binary])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
