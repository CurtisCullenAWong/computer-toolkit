use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn get_nvidia_device_id() -> Result<String, String> {
    let output = Command::new("pnputil")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["/enum-devices", "/class", "Display"])
        .output()
        .map_err(|e| format!("Failed to run pnputil: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Parse the output blocks
    let mut current_instance_id = None;
    
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Instance ID:") {
            let parts: Vec<&str> = trimmed.splitn(2, ':').collect();
            if parts.len() == 2 {
                current_instance_id = Some(parts[1].trim().to_string());
            }
        } else if trimmed.starts_with("Manufacturer Name:") || trimmed.starts_with("Device Description:") {
            if trimmed.to_lowercase().contains("nvidia") {
                if let Some(id) = current_instance_id.take() {
                    return Ok(id);
                }
            }
        }
    }

    Err("NVIDIA GPU device not found on this system.".to_string())
}

/// Toggle the dedicated GPU device using Windows PnP Utility (pnputil).
#[tauri::command]
pub async fn toggle_gpu(enable: bool) -> Result<String, String> {
    println!(
        "[GPU Control] toggle_gpu(enable: {}) invoked.",
        enable
    );

    #[cfg(target_os = "windows")]
    {
        // Toggle the dedicated GPU device (enable/disable) via pnputil command.

        let device_id = get_nvidia_device_id()?;
        let action = if enable { "/enable-device" } else { "/disable-device" };

        let output = Command::new("pnputil")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&[action, &device_id])
            .output()
            .map_err(|e| format!("Failed to execute pnputil: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success()
            || stdout.contains("already enabled")
            || stdout.contains("already disabled")
            || stderr.contains("already enabled")
            || stderr.contains("already disabled")
        {
            if enable {
                Ok("Dedicated GPU has been enabled successfully.".to_string())
            } else {
                Ok("Dedicated GPU has been disabled successfully.".to_string())
            }
        } else {
            let error_msg = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else {
                stdout.trim().to_string()
            };
            Err(format!("Failed to switch GPU: {}", error_msg))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok("GPU switching is only supported on Windows.".to_string())
    }
}

/// Detect all installed GPU adapters via WMI.
#[tauri::command]
pub async fn detect_gpu() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&[
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
            ])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let gpu_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let gpus: Vec<&str> = gpu_str
                    .lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty())
                    .collect();
                if !gpus.is_empty() {
                    Ok(Some(gpus.join(", ")))
                } else {
                    Ok(None)
                }
            }
            _ => Ok(None),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

/// Read the current GPU device status to reflect actual state.
#[tauri::command]
pub async fn get_gpu_preference() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let device_id = match get_nvidia_device_id() {
            Ok(id) => id,
            Err(_) => return Ok(false),
        };
        let output = Command::new("pnputil")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&["/enum-devices", "/instanceid", &device_id])
            .output()
            .map_err(|e| format!("Failed to query GPU status: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let is_started = stdout.lines().any(|line| {
                let trimmed = line.trim();
                trimmed.starts_with("Status:") && trimmed.contains("Started")
            });
            Ok(is_started)
        } else {
            Ok(false)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}
