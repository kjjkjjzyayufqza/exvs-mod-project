use std::fs;
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
