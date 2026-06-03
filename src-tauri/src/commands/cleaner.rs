use std::path::{Path, PathBuf};
use std::fs;

#[derive(serde::Serialize)]
pub struct ScanResults {
    temp_files_count: u64,
    temp_files_size: u64,
    prefetch_logs_count: u64,
    prefetch_logs_size: u64,
    app_cache_count: u64,
    app_cache_size: u64,
    is_admin: bool,
}

#[derive(serde::Serialize)]
pub struct CleanResults {
    deleted_count: u64,
    deleted_size: u64,
    skipped_count: u64,
    skipped_size: u64,
}

fn get_user_temp_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .map(|p| PathBuf::from(p).join("AppData").join("Local").join("Temp"))
            .ok()
            .or_else(|| Some(std::env::temp_dir()))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Some(std::env::temp_dir())
    }
}

fn get_system_temp_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        Some(PathBuf::from(system_root).join("Temp"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

fn get_prefetch_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        Some(PathBuf::from(system_root).join("Prefetch"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

fn get_log_dirs() -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        let sys_root_path = PathBuf::from(system_root);
        vec![
            sys_root_path.join("System32").join("LogFiles"),
            sys_root_path.join("Log"),
        ]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![]
    }
}

fn get_app_data_dir() -> Option<PathBuf> {
    let base_dir = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    Some(PathBuf::from(base_dir).join("ComputerToolkit"))
}

fn scan_dir_recursive(path: &Path, files_count: &mut u64, files_size: &mut u64, depth: u32) {
    if depth > 32 {
        return;
    }
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_symlink() {
                        continue;
                    }
                    let entry_path = entry.path();
                    if file_type.is_dir() {
                        scan_dir_recursive(&entry_path, files_count, files_size, depth + 1);
                    } else if file_type.is_file() {
                        if let Ok(metadata) = entry.metadata() {
                            *files_count += 1;
                            *files_size += metadata.len();
                        }
                    }
                }
            }
        }
    }
}

fn scan_dir(path: &Path, files_count: &mut u64, files_size: &mut u64) {
    scan_dir_recursive(path, files_count, files_size, 0);
}

fn scan_app_data_dir_recursive(path: &Path, files_count: &mut u64, files_size: &mut u64, depth: u32) {
    if depth > 32 {
        return;
    }
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_symlink() {
                        continue;
                    }
                    let entry_path = entry.path();
                    if let Some(file_name) = entry_path.file_name().and_then(|n| n.to_str()) {
                        if file_name == "instance.lock" || file_name == "show_window.signal" || file_name == "alarms.json" {
                            continue;
                        }
                    }
                    if file_type.is_dir() {
                        scan_app_data_dir_recursive(&entry_path, files_count, files_size, depth + 1);
                    } else if file_type.is_file() {
                        if let Ok(metadata) = entry.metadata() {
                            *files_count += 1;
                            *files_size += metadata.len();
                        }
                    }
                }
            }
        }
    }
}

fn scan_app_data_dir(path: &Path, files_count: &mut u64, files_size: &mut u64) {
    scan_app_data_dir_recursive(path, files_count, files_size, 0);
}

fn clean_dir_recursive(
    path: &Path,
    deleted_count: &mut u64,
    deleted_size: &mut u64,
    skipped_count: &mut u64,
    skipped_size: &mut u64,
    depth: u32,
) {
    if depth > 32 {
        return;
    }
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(file_type) = entry.file_type() {
                    let entry_path = entry.path();
                    if file_type.is_symlink() {
                        if let Ok(metadata) = entry.metadata() {
                            let file_size = metadata.len();
                            match fs::remove_file(&entry_path) {
                                Ok(_) => {
                                    *deleted_count += 1;
                                    *deleted_size += file_size;
                                }
                                Err(_) => {
                                    *skipped_count += 1;
                                    *skipped_size += file_size;
                                }
                            }
                        }
                        continue;
                    }
                    if file_type.is_dir() {
                        clean_dir_recursive(
                            &entry_path,
                            deleted_count,
                            deleted_size,
                            skipped_count,
                            skipped_size,
                            depth + 1,
                        );
                        let _ = fs::remove_dir(&entry_path);
                    } else if file_type.is_file() {
                        if let Ok(metadata) = entry.metadata() {
                            let file_size = metadata.len();
                            match fs::remove_file(&entry_path) {
                                Ok(_) => {
                                    *deleted_count += 1;
                                    *deleted_size += file_size;
                                }
                                Err(_) => {
                                    *skipped_count += 1;
                                    *skipped_size += file_size;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn clean_dir(
    path: &Path,
    deleted_count: &mut u64,
    deleted_size: &mut u64,
    skipped_count: &mut u64,
    skipped_size: &mut u64,
) {
    clean_dir_recursive(path, deleted_count, deleted_size, skipped_count, skipped_size, 0);
}

fn clean_app_data_dir_recursive(
    path: &Path,
    deleted_count: &mut u64,
    deleted_size: &mut u64,
    skipped_count: &mut u64,
    skipped_size: &mut u64,
    depth: u32,
) {
    if depth > 32 {
        return;
    }
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(file_type) = entry.file_type() {
                    let entry_path = entry.path();
                    if let Some(file_name) = entry_path.file_name().and_then(|n| n.to_str()) {
                        if file_name == "instance.lock" || file_name == "show_window.signal" || file_name == "alarms.json" {
                            continue;
                        }
                    }
                    if file_type.is_symlink() {
                        if let Ok(metadata) = entry.metadata() {
                            let file_size = metadata.len();
                            match fs::remove_file(&entry_path) {
                                Ok(_) => {
                                    *deleted_count += 1;
                                    *deleted_size += file_size;
                                }
                                Err(_) => {
                                    *skipped_count += 1;
                                    *skipped_size += file_size;
                                }
                            }
                        }
                        continue;
                    }
                    if file_type.is_dir() {
                        clean_app_data_dir_recursive(
                            &entry_path,
                            deleted_count,
                            deleted_size,
                            skipped_count,
                            skipped_size,
                            depth + 1,
                        );
                        let _ = fs::remove_dir(&entry_path);
                    } else if file_type.is_file() {
                        if let Ok(metadata) = entry.metadata() {
                            let file_size = metadata.len();
                            match fs::remove_file(&entry_path) {
                                Ok(_) => {
                                    *deleted_count += 1;
                                    *deleted_size += file_size;
                                }
                                Err(_) => {
                                    *skipped_count += 1;
                                    *skipped_size += file_size;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn clean_app_data_dir(
    path: &Path,
    deleted_count: &mut u64,
    deleted_size: &mut u64,
    skipped_count: &mut u64,
    skipped_size: &mut u64,
) {
    clean_app_data_dir_recursive(path, deleted_count, deleted_size, skipped_count, skipped_size, 0);
}

/// Scan temp folders, prefetch/log folders, and app data cache.
#[tauri::command]
pub async fn scan_junk_folders() -> Result<ScanResults, String> {
    let mut temp_files_count = 0;
    let mut temp_files_size = 0;
    let mut prefetch_logs_count = 0;
    let mut prefetch_logs_size = 0;
    let mut app_cache_count = 0;
    let mut app_cache_size = 0;

    #[cfg(target_os = "windows")]
    let is_admin = crate::is_running_as_admin();
    #[cfg(not(target_os = "windows"))]
    let is_admin = true;

    // Scan Temp Folders (User Temp & System Temp)
    if let Some(user_temp) = get_user_temp_dir() {
        scan_dir(&user_temp, &mut temp_files_count, &mut temp_files_size);
    }
    if let Some(system_temp) = get_system_temp_dir() {
        scan_dir(&system_temp, &mut temp_files_count, &mut temp_files_size);
    }

    // Scan Prefetch & Log folders
    if let Some(prefetch) = get_prefetch_dir() {
        scan_dir(&prefetch, &mut prefetch_logs_count, &mut prefetch_logs_size);
    }
    for log_dir in get_log_dirs() {
        scan_dir(&log_dir, &mut prefetch_logs_count, &mut prefetch_logs_size);
    }

    // Scan App Cache
    if let Some(app_data_dir) = get_app_data_dir() {
        scan_app_data_dir(&app_data_dir, &mut app_cache_count, &mut app_cache_size);
    }

    Ok(ScanResults {
        temp_files_count,
        temp_files_size,
        prefetch_logs_count,
        prefetch_logs_size,
        app_cache_count,
        app_cache_size,
        is_admin,
    })
}

/// Delete temporary files, advanced caches, and app data cache.
#[tauri::command]
pub async fn clean_junk_folders(
    clean_temp: bool,
    clean_prefetch_logs: bool,
    clean_app_cache: bool,
) -> Result<CleanResults, String> {
    let mut deleted_count = 0;
    let mut deleted_size = 0;
    let mut skipped_count = 0;
    let mut skipped_size = 0;

    if clean_temp {
        if let Some(user_temp) = get_user_temp_dir() {
            clean_dir(
                &user_temp,
                &mut deleted_count,
                &mut deleted_size,
                &mut skipped_count,
                &mut skipped_size,
            );
        }
        if let Some(system_temp) = get_system_temp_dir() {
            clean_dir(
                &system_temp,
                &mut deleted_count,
                &mut deleted_size,
                &mut skipped_count,
                &mut skipped_size,
            );
        }
    }

    if clean_prefetch_logs {
        if let Some(prefetch) = get_prefetch_dir() {
            clean_dir(
                &prefetch,
                &mut deleted_count,
                &mut deleted_size,
                &mut skipped_count,
                &mut skipped_size,
            );
        }
        for log_dir in get_log_dirs() {
            clean_dir(
                &log_dir,
                &mut deleted_count,
                &mut deleted_size,
                &mut skipped_count,
                &mut skipped_size,
            );
        }
    }

    if clean_app_cache {
        if let Some(app_data_dir) = get_app_data_dir() {
            clean_app_data_dir(
                &app_data_dir,
                &mut deleted_count,
                &mut deleted_size,
                &mut skipped_count,
                &mut skipped_size,
            );
        }
    }

    Ok(CleanResults {
        deleted_count,
        deleted_size,
        skipped_count,
        skipped_size,
    })
}
