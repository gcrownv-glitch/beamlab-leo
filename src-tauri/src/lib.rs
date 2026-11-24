use std::fs;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAX_EXPORT_BYTES: usize = 50 * 1024 * 1024;

fn allowed_filter(ext: &str) -> Option<(&'static str, &'static str)> {
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some(("PNG", "png")),
        "pdf" => Some(("PDF", "pdf")),
        "csv" => Some(("CSV", "csv")),
        "json" => Some(("JSON", "json")),
        _ => None,
    }
}

fn sanitize_filename(raw: &str, allowed_ext: &str) -> String {
    let base = Path::new(raw)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("beamlab-export");
    let stem = Path::new(base)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("beamlab-export");
    let clean_stem: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let final_stem = clean_stem.trim_matches('.');
    let safe_stem = if final_stem.is_empty() {
        "beamlab-export"
    } else {
        final_stem
    };
    format!("{safe_stem}.{allowed_ext}")
}

/// Abre el diálogo nativo desde Rust, valida la extensión permitida y escribe
/// únicamente los bytes de exportación en la ruta elegida por el usuario.
#[tauri::command]
async fn save_export(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
    open_after: bool,
) -> Result<Option<String>, String> {
    if data.len() > MAX_EXPORT_BYTES {
        return Err(format!(
            "Archivo demasiado grande ({} bytes > límite de 50 MB).",
            data.len()
        ));
    }
    let req_ext = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let (filter_label, allowed_ext) =
        allowed_filter(req_ext).ok_or_else(|| format!("Extensión no permitida: .{req_ext}"))?;
    let safe_name = sanitize_filename(&filename, allowed_ext);

    let picked = app
        .dialog()
        .file()
        .set_file_name(&safe_name)
        .add_filter(filter_label, &[allowed_ext])
        .blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let mut path = file_path
        .into_path()
        .map_err(|e| format!("Ruta no válida para guardado local: {e}"))?;

    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case(allowed_ext) => {}
        Some(ext) => {
            return Err(format!(
                "La extensión elegida (.{ext}) no coincide con .{allowed_ext}."
            ));
        }
        None => {
            path.set_extension(allowed_ext);
        }
    }

    fs::write(&path, &data).map_err(|e| format!("No se pudo guardar {}: {e}", path.display()))?;
    let saved_str = path.to_string_lossy().to_string();

    if open_after && (allowed_ext == "png" || allowed_ext == "pdf") {
        let _ = app.opener().open_path(saved_str.as_str(), None::<&str>);
    }
    Ok(Some(saved_str))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_export])
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
