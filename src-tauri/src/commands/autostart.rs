use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Add or remove the app from Windows startup registry (HKCU Run key).
/// Non-blocking — uses the actual process exit status, not a simulated delay.
#[tauri::command]
pub async fn set_autostart(enable: bool) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let current_exe = std::env::current_exe()
            .map_err(|e| format!("Failed to get current executable path: {}", e))?;
        let exe_str = current_exe
            .to_str()
            .ok_or_else(|| "Invalid UTF-8 in executable path".to_string())?;

        if enable {
            let output = Command::new("reg")
                .creation_flags(CREATE_NO_WINDOW)
                .args(&[
                    "add",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v",
                    "ComputerToolkit",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &format!("\"{}\" --minimized", exe_str),
                    "/f",
                ])
                .output()
                .map_err(|e| format!("Failed to execute reg command: {}", e))?;

            if output.status.success() {
                Ok("Successfully added to Windows startup.".to_string())
            } else {
                let err = String::from_utf8_lossy(&output.stderr);
                Err(format!("Registry add failed: {}", err))
            }
        } else {
            let output = Command::new("reg")
                .creation_flags(CREATE_NO_WINDOW)
                .args(&[
                    "delete",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v",
                    "ComputerToolkit",
                    "/f",
                ])
                .output()
                .map_err(|e| format!("Failed to execute reg command: {}", e))?;

            if output.status.success() {
                Ok("Successfully removed from Windows startup.".to_string())
            } else {
                // Key not found means it was already removed — treat as success
                Ok("Already removed from Windows startup.".to_string())
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok("Startup configuration is only supported on Windows.".to_string())
    }
}

/// Query whether the app is currently registered in Windows startup.
/// Returns the actual registry state — no simulated delay.
#[tauri::command]
pub async fn get_autostart() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&[
                "query",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "ComputerToolkit",
            ])
            .output()
            .map_err(|e| format!("Failed to execute reg query: {}", e))?;

        Ok(output.status.success())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}
