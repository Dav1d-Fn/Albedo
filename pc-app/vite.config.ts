import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 1440: 1420 and 1430 (Deck launcher) are taken. Tauri expects a fixed port.
export default defineConfig(() => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1440,
    strictPort: true,
    // React, Vite and the Inter font come from the repository's node_modules one level up.
    fs: { allow: [".."] },
    // `npm run dev` in a plain browser: companion calls go through here (the companion sends no CORS headers).
    proxy: { "/companion": { target: "http://127.0.0.1:47995", rewrite: (path: string) => path.replace(/^\/companion/, "") } },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
