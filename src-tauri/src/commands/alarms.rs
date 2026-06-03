use std::fs;
use std::path::PathBuf;

#[allow(dead_code)]
fn get_alarms_file_path() -> Option<PathBuf> {
    let base_dir = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    Some(PathBuf::from(base_dir).join("ComputerToolkit").join("alarms.json"))
}

#[tauri::command]
#[allow(dead_code)]
pub async fn read_alarms() -> Result<String, String> {
    if let Some(path) = get_alarms_file_path() {
        if path.exists() {
            return fs::read_to_string(path)
                .map_err(|e| format!("Failed to read alarms file: {}", e));
        }
    }
    Ok("[]".to_string())
}

#[tauri::command]
#[allow(dead_code)]
pub async fn write_alarms(alarms_json: String) -> Result<(), String> {
    if let Some(path) = get_alarms_file_path() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        return fs::write(path, alarms_json)
            .map_err(|e| format!("Failed to write alarms file: {}", e));
    }
    Err("Could not determine alarms file path".to_string())
}
