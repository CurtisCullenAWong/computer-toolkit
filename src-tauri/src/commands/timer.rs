use std::thread;
use std::time::Duration;

#[tauri::command]
pub fn start_timer(seconds: u64) {
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(seconds));
        println!("Timer finished!");
        // later: trigger notification
    });
}