use tauri::Manager;

mod commands;
mod nutexb_lib;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(commands::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::my_custom_command,
            commands::read_file,
            commands::exec_shell_command,
            commands::watch_folder,
            commands::nutexb_read_info,
            commands::nutexb_export_dds,
            commands::nutexb_export_png_uncompressed,
            commands::nutexb_export_png
        ])
        .setup(|app| {
            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                window.close_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
