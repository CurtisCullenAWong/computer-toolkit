mod commands;

use std::fs;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

fn get_lock_file_path() -> PathBuf {
    let app_data = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(app_data)
        .join("ComputerToolkit")
        .join("instance.lock")
}

fn try_acquire_lock() -> bool {
    let lock_path = get_lock_file_path();
    
    // Create directory if it doesn't exist
    if let Some(parent) = lock_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    
    // Try to create the lock file with exclusive access
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
    {
        Ok(_) => {
            // Store lock file path for cleanup on exit
            true
        }
        Err(_) => false,
    }
}

fn release_lock() {
    let lock_path = get_lock_file_path();
    let _ = fs::remove_file(lock_path);
}

#[cfg(target_os = "windows")]
fn is_running_as_admin() -> bool {
    use windows_sys::Win32::Foundation::{BOOL, FALSE};
    use windows_sys::Win32::Security::{
        AllocateAndInitializeSid, CheckTokenMembership, FreeSid, SECURITY_NT_AUTHORITY,
    };
    use windows_sys::Win32::System::SystemServices::{
        DOMAIN_ALIAS_RID_ADMINS, SECURITY_BUILTIN_DOMAIN_RID,
    };

    let mut is_admin: BOOL = FALSE;
    let mut administrators_sid = std::ptr::null_mut();
    let mut nt_authority = SECURITY_NT_AUTHORITY;

    unsafe {
        let success = AllocateAndInitializeSid(
            &mut nt_authority,
            2,
            SECURITY_BUILTIN_DOMAIN_RID as u32,
            DOMAIN_ALIAS_RID_ADMINS as u32,
            0,
            0,
            0,
            0,
            0,
            0,
            &mut administrators_sid,
        );

        if success != FALSE {
            if CheckTokenMembership(std::ptr::null_mut(), administrators_sid, &mut is_admin)
                == FALSE
            {
                is_admin = FALSE;
            }
            FreeSid(administrators_sid);
        }
    }

    is_admin != FALSE
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Check if another instance is already running
    if !try_acquire_lock() {
        // Another instance is already running, try to communicate with it
        eprintln!("An instance of Computer Toolkit is already running.");
        // Create a signal file to tell the running instance to show itself
        let signal_path = get_lock_file_path()
            .parent()
            .map(|p| p.join("show_window.signal"))
            .unwrap_or_default();
        let _ = fs::write(&signal_path, "");
        // Exit this instance
        std::process::exit(0);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::shutdown::shutdown_after,
            commands::shutdown::cancel_shutdown,
            commands::timer::start_timer,
            commands::gpu::toggle_gpu,
            commands::gpu::detect_gpu,
            commands::gpu::get_gpu_preference,
            commands::autostart::get_autostart,
            commands::autostart::set_autostart,
            commands::window_prefs::get_minimize_on_close,
            commands::window_prefs::set_minimize_on_close,
        ])
        .setup(|app| {
            if !is_running_as_admin() {
                eprintln!("Computer Toolkit requires Administrator privileges.");
                std::process::exit(1);
            }

            // 1. Correctly instantiate the items using the AppHandle
            let handle = app.handle();
            let show_item = MenuItem::with_id(handle, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(handle, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(handle, &[&show_item, &quit_item])?;

            let icon = app
                .default_window_icon()
                .cloned()
                .expect("failed to get default icon");

            // 2. Build the System Tray and cleanly intercept matching event IDs
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&tray_menu)
                .on_menu_event(move |app_handle, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray_icon, event| {
                    // --- FIX: Filter explicitly for Left Click up/down behavior ---
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app_handle = tray_icon.app_handle();
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            // If launched with --minimized flag, hide the window entirely on startup
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--minimized".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Start watching for signal file to show window
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let signal_path = get_lock_file_path()
                    .parent()
                    .map(|p| p.join("show_window.signal"))
                    .unwrap_or_default();
                
                loop {
                    if signal_path.exists() {
                        // Signal received - show the window
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                        // Remove the signal file
                        let _ = fs::remove_file(&signal_path);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            });
            
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let should_minimize = {
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        const CREATE_NO_WINDOW: u32 = 0x08000000;
                        let result = std::process::Command::new("reg")
                            .creation_flags(CREATE_NO_WINDOW)
                            .args(&[
                                "query",
                                "HKCU\\Software\\ComputerToolkit",
                                "/v",
                                "MinimizeOnClose",
                            ])
                            .output();
                        match result {
                            Ok(output) if output.status.success() => {
                                let stdout = String::from_utf8_lossy(&output.stdout);
                                stdout.contains("0x1")
                            }
                            _ => false,
                        }
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        false
                    }
                };

                if should_minimize {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    
    // Cleanup lock file on exit
    release_lock();
}
