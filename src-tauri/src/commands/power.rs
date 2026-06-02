use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Windows helpers ──────────────────────────────────────────────────────────

/// Toggle hibernate on/off via powercfg. Required to force true S3 sleep
/// instead of hybrid-sleep, which blocks sleep state.
#[cfg(target_os = "windows")]
fn run_powercfg(enable: bool) {
    let arg = if enable { "on" } else { "off" };
    let _ = Command::new("C:\\Windows\\System32\\powercfg.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["-h", arg])
        .output();
}

/// Put the system to sleep using rundll32.
#[cfg(target_os = "windows")]
fn do_sleep() {
    // Disable hibernate first so Windows uses real S3 sleep (not hybrid sleep)
    run_powercfg(false);
    let _ = Command::new("C:\\Windows\\System32\\rundll32.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["powrprof.dll,SetSuspendState", "0,1,0"])
        .output();
    run_powercfg(true);
}

// ── macOS helpers ─────────────────────────────────────────────────────────────

/// Put the macOS system to sleep via osascript.
#[cfg(target_os = "macos")]
fn do_sleep_macos() -> std::io::Result<std::process::Output> {
    Command::new("osascript")
        .args(&["-e", "tell application \"System Events\" to sleep"])
        .output()
}

/// Restart the macOS system via osascript.
#[cfg(target_os = "macos")]
fn do_restart_macos() -> std::io::Result<std::process::Output> {
    Command::new("osascript")
        .args(&["-e", "tell application \"System Events\" to restart"])
        .output()
}

// ── Tauri commands ───────────────────────────────────────────────────────────

/// Schedule or execute an OS power action (shutdown, sleep, hibernate, restart) after `seconds` seconds.
/// Passing `seconds = 0` triggers the action immediately.
/// The action can be cancelled by calling `cancel_power_action`.
#[tauri::command]
pub async fn execute_power_action(
    action: String,
    seconds: u64,
) -> Result<String, String> {
    println!(
        "[Power] execute_power_action(action={}, seconds={})",
        action, seconds
    );

    #[cfg(target_os = "windows")]
    {
        let seconds_str = seconds.to_string();
        let action_lower = action.to_lowercase();

        if action_lower == "sleep" {
            if !crate::is_running_as_admin() {
                return Err("REQUIRES_ADMIN".to_string());
            }

            if seconds > 0 {
                // Countdown first, then sleep
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(seconds));
                    do_sleep();
                });
                Ok(format!("Sleep scheduled in {} seconds.", seconds))
            } else {
                // Immediate sleep
                do_sleep();
                Ok("System put to sleep.".to_string())
            }
        } else if action_lower == "hibernate" {
            if seconds > 0 {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(seconds));
                    let _ = Command::new("shutdown")
                        .creation_flags(CREATE_NO_WINDOW)
                        .args(&["/h"])
                        .output();
                });
                Ok(format!("Hibernate scheduled in {} seconds.", seconds))
            } else {
                // Immediate hibernate
                let output = Command::new("shutdown")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(&["/h"])
                    .output()
                    .map_err(|e| format!("Failed to hibernate: {}", e))?;
                if output.status.success() {
                    Ok("System hibernated.".to_string())
                } else {
                    let err = String::from_utf8_lossy(&output.stderr);
                    Err(format!("Hibernate failed: {}", err.trim()))
                }
            }
        } else {
            // Shutdown or Restart — use the built-in shutdown.exe
            let flag = if action_lower == "restart" {
                "/r"
            } else {
                "/s"
            };
            let msg = if action_lower == "restart" {
                "Restart scheduled by Computer Toolkit."
            } else {
                "Shutdown scheduled by Computer Toolkit."
            };
            let output = Command::new("shutdown")
                .creation_flags(CREATE_NO_WINDOW)
                .args(&[flag, "/t", &seconds_str, "/c", msg, "/f"])
                .output()
                .map_err(|e| format!("Failed to invoke {} command: {}", action, e))?;

            if output.status.success() {
                if seconds == 0 {
                    Ok(format!(
                        "{} initiated immediately.",
                        if action_lower == "restart" {
                            "Restart"
                        } else {
                            "Shutdown"
                        }
                    ))
                } else {
                    Ok(format!(
                        "{} scheduled in {} seconds.",
                        if action_lower == "restart" {
                            "Restart"
                        } else {
                            "Shutdown"
                        },
                        seconds
                    ))
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                Err(format!(
                    "{} command failed: {} {}",
                    if action_lower == "restart" {
                        "Restart"
                    } else {
                        "Shutdown"
                    },
                    stderr.trim(),
                    stdout.trim()
                ))
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let action_lower = action.to_lowercase();

        if action_lower == "sleep" {
            if seconds > 0 {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(seconds));
                    #[cfg(target_os = "macos")]
                    let _ = do_sleep_macos();
                    #[cfg(not(target_os = "macos"))]
                    let _ = Command::new("systemctl").args(&["suspend"]).output();
                });
                Ok(format!("Sleep scheduled in {} seconds.", seconds))
            } else {
                #[cfg(target_os = "macos")]
                let output =
                    do_sleep_macos().map_err(|e| format!("Failed to invoke sleep: {}", e))?;
                #[cfg(not(target_os = "macos"))]
                let output = Command::new("systemctl")
                    .args(&["suspend"])
                    .output()
                    .map_err(|e| format!("Failed to invoke sleep: {}", e))?;

                if output.status.success() {
                    Ok("System put to sleep.".to_string())
                } else {
                    Err("Sleep command failed.".to_string())
                }
            }
        } else if action_lower == "restart" {
            if seconds > 0 {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(seconds));
                    #[cfg(target_os = "macos")]
                    let _ = do_restart_macos();
                    #[cfg(not(target_os = "macos"))]
                    let _ = Command::new("reboot").output();
                });
                return Ok(format!("Restart scheduled in {} seconds.", seconds));
            }

            #[cfg(target_os = "macos")]
            let output =
                do_restart_macos().map_err(|e| format!("Failed to invoke restart: {}", e))?;
            #[cfg(not(target_os = "macos"))]
            let output = Command::new("reboot")
                .output()
                .map_err(|e| format!("Failed to invoke restart: {}", e))?;

            if output.status.success() {
                Ok("Restart initiated.".to_string())
            } else {
                Err("Restart command failed.".to_string())
            }
        } else {
            // Shutdown
            let minutes_arg = format!("+{}", seconds / 60);
            let output = Command::new("shutdown")
                .args(&["-h", &minutes_arg])
                .output()
                .map_err(|e| format!("Failed to invoke shutdown: {}", e))?;
            if output.status.success() {
                Ok(format!("Shutdown scheduled in {} seconds.", seconds))
            } else {
                Err(
                    "Shutdown command failed. Ensure you have the necessary permissions."
                        .to_string(),
                )
            }
        }
    }
}

/// Cancel a scheduled power action.
#[tauri::command]
pub async fn cancel_power_action() -> Result<String, String> {
    println!("[Power] cancel_power_action() invoked.");

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("shutdown")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&["/a"])
            .output()
            .map_err(|e| format!("Failed to cancel scheduled action: {}", e))?;

        if output.status.success() {
            Ok("Scheduled action cancelled successfully.".to_string())
        } else {
            Ok("No scheduled action was found to cancel.".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("shutdown")
            .args(&["-c"])
            .output()
            .map_err(|e| format!("Failed to cancel scheduled action: {}", e))?;

        if output.status.success() {
            Ok("Scheduled action cancelled.".to_string())
        } else {
            Ok("No scheduled action was found to cancel.".to_string())
        }
    }
}
