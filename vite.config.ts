import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 3000,
    strictPort: true,
    // Don't watch the Rust crate / build artifacts — avoids needless dev-server
    // churn and full reloads triggered by cargo writing into src-tauri/target.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    // Pre-transform the always-loaded shell so first paint isn't blocked on a
    // cold request waterfall.
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/App.tsx", "./src/page/Main/page.tsx"],
    },
  },
  // 3. to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ["VITE_", "TAURI_"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2022",
    cssTarget: "es2022",
    // The 3D editor pages are lazy-loaded, so Rolldown extracts the three.js
    // ecosystem into a shared async chunk that only downloads when one of those
    // pages is opened. Do NOT pin it into a named manualChunk — manual chunks
    // are treated as initial chunks and get preloaded in index.html, which
    // would pull three.js (~500 kB gzip) back into the startup path.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}));
