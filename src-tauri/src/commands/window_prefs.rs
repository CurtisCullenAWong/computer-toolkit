use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Get the minimize-on-close preference from the registry.
#[tauri::command]
pub async fn get_minimize_on_close() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const REG_KEY: &str = "HKCU\\Software\\ComputerToolkit";
        const MINIMIZE_ON_CLOSE_VALUE: &str = "MinimizeOnClose";

        let output = Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&[
                "query",
                REG_KEY,
                "/v",
                MINIMIZE_ON_CLOSE_VALUE,
            ])
            .output()
            .map_err(|e| format!("Failed to query registry: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Value is "0x1" for true, "0x0" for false
            Ok(stdout.contains("0x1"))
        } else {
            // Key not found — default to false
            Ok(false)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// Set the minimize-on-close preference in the registry.
#[tauri::command]
pub async fn set_minimize_on_close(enable: bool) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const REG_KEY: &str = "HKCU\\Software\\ComputerToolkit";
        const MINIMIZE_ON_CLOSE_VALUE: &str = "MinimizeOnClose";

        let value = if enable { "1" } else { "0" };
        let output = Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&[
                "add",
                REG_KEY,
                "/v",
                MINIMIZE_ON_CLOSE_VALUE,
                "/t",
                "REG_DWORD",
                "/d",
                value,
                "/f",
            ])
            .output()
            .map_err(|e| format!("Failed to write registry: {}", e))?;

        if output.status.success() {
            Ok(if enable {
                "Minimize on close enabled.".to_string()
            } else {
                "Minimize on close disabled.".to_string()
            })
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            Err(format!("Registry write failed: {}", err))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok("Window preferences are only supported on Windows.".to_string())
    }
}
