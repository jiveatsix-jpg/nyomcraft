// Escritura directa vía std::fs, evitando el sistema de scopes del plugin fs
// (fs:default solo concede lectura de los directorios propios de la app, no
// escritura arbitraria en la ruta que devuelve el dialogo de guardado).
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
