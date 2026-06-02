use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Schedule an OS shutdown after `seconds` seconds.
/// Passing `seconds = 0` triggers an immediate shutdown.
/// The shutdown can be cancelled by calling `cancel_shutdown`.
#[tauri::command]
pub async fn shutdown_after(seconds: u64) -> Result<String, String> {
    println!(
        "[Shutdown] shutdown_after({} seconds) invoked.",
        seconds
    );

    #[cfg(target_os = "windows")]
    {
        let seconds_str = seconds.to_string();
        let output = Command::new("shutdown")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&[
                "/s",          // Shutdown (not restart)
                "/t",          // Timeout flag
                &seconds_str,  // Seconds until shutdown
                "/c", "Shutdown scheduled by Computer Toolkit.", // Optional message
                "/f",          // Force close running apps
            ])
            .output()
            .map_err(|e| format!("Failed to invoke shutdown command: {}", e))?;

        if output.status.success() {
            if seconds == 0 {
                Ok("Shutdown initiated immediately. Goodbye!".to_string())
            } else {
                Ok(format!(
                    "Shutdown scheduled in {} seconds. Run 'shutdown /a' to cancel.",
                    seconds
                ))
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            Err(format!(
                "Shutdown command failed: {} {}",
                stderr.trim(),
                stdout.trim()
            ))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Linux/macOS fallback
        let seconds_str = seconds.to_string();
        let output = Command::new("shutdown")
            .args(&["-h", &format!("+{}", (seconds / 60).max(1))])
            .output()
            .map_err(|e| format!("Failed to invoke shutdown: {}", e))?;

        if output.status.success() {
            Ok(format!("Shutdown scheduled in {} seconds.", seconds))
        } else {
            Err("Shutdown command failed. Ensure you have the necessary permissions.".to_string())
        }
    }
}

/// Cancel a previously scheduled shutdown.
#[tauri::command]
pub async fn cancel_shutdown() -> Result<String, String> {
    println!("[Shutdown] cancel_shutdown() invoked.");

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("shutdown")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&["/a"])
            .output()
            .map_err(|e| format!("Failed to cancel shutdown: {}", e))?;

        if output.status.success() {
            Ok("Scheduled shutdown cancelled successfully.".to_string())
        } else {
            // /a fails if no shutdown is pending — that's fine
            Ok("No scheduled shutdown was found to cancel.".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("shutdown")
            .args(&["-c"])
            .output()
            .map_err(|e| format!("Failed to cancel shutdown: {}", e))?;

        if output.status.success() {
            Ok("Shutdown cancelled.".to_string())
        } else {
            Ok("No scheduled shutdown was found to cancel.".to_string())
        }
    }
}
