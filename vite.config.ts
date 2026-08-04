import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Ports are configurable via env so the app can run alongside others:
//   CLIENT_PORT  the Vite dev server port            (default 5173)
//   API_PORT     the Express server to proxy /api to  (default 8090, matches server PORT)
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5173);
const API_PORT = Number(process.env.API_PORT ?? 8090);
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@wc/speech": path.resolve(rootDir, "packages/speech/src/index.ts"),
    },
  },
  server: {
    port: CLIENT_PORT,
    // Prefer 127.0.0.1 over localhost — on Windows, localhost can try IPv6
    // first and surface proxy ECONNREFUSED as a browser 500 for /api/log.
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
    // If you expose this through a tunnel (e.g. Cloudflare), add its hostname:
    // allowedHosts: ["your-app.example.com"],
  },
});
