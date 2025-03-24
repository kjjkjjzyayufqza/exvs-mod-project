use std::{fs, process::Command};
use tauri::ipc::{InvokeBody, Response};

#[tauri::command]
pub fn my_custom_command() {
    println!("I was invoked from JS!");
}

#[tauri::command]
pub fn read_file(path: &str) -> Response {
    match fs::read(path) {
        Ok(data) => {
            println!("File read succesfully");
            //if file size over 1GB we need throw error
            if data.len() > 1024 * 1024 * 1024 {
                println!("Error reading file, file size over 1GB");
                return Response::new(InvokeBody::Raw(vec![]));
            }
            return Response::new(InvokeBody::Raw(data));
        }
        Err(e) => {
            println!("Error reading file: {:?}", e);
            return Response::new(InvokeBody::Raw(vec![]));
        }
    }
}

#[tauri::command]
pub async fn exec_shell_command(command: &str) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", command])
            .output()
    } else {
        Command::new("sh")
            .arg("-c")
            .arg(command)
            .output()
    };

    match output {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}
