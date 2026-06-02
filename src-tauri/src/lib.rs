mod commands;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

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
}
