// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[path = "fileManager/readerFile.rs"]
mod reader_file;
// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>>{
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            greet,
            reader_file::read_binary_file,
            reader_file::save_buffer_to_file,
            reader_file::decompression_deflate_raw_buffer,
            reader_file::create_large_file_and_print_done
        ])
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    Ok(())
}
