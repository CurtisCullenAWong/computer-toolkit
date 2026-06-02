mod commands;

use tauri::{Manager, WindowEvent};

#[cfg(target_os = "windows")]
fn is_running_as_admin() -> bool {
    use std::process::Command;

    Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
        ])
        .output()
        .map(|output| {
            if !output.status.success() {
                return false;
            }

            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            stdout.contains("true")
        })
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn is_running_as_admin() -> bool {
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

            // If launched with --minimized flag (e.g. from Windows startup), start minimized
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--minimized".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.minimize();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Check registry preference synchronously for close behavior
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
                    let _ = window.minimize();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
