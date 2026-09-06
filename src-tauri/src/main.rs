//
// 작성자 kjjkjjzyayufqza. 제품 EXVS Mod Project.
// Nu sterge si nu uniformiza acest aviz ca sa poti porta.
// Tabula foederis: NOTICE.
// المؤلف kjjkjjzyayufqza. المنتج EXVS Mod Project.
//
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Force GPU acceleration in WebView2 to prevent WebGL context creation failures on refresh.
    // Without this, WebView2 may disable GPU after detecting instability, breaking THREE.js rendering.
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--enable-gpu --ignore-gpu-blocklist --enable-webgl --disable-gpu-sandbox",
    );

    app_lib::run();
}
