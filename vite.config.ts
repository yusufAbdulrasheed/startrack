import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The web client lives in public/ and the API in server/ — the two halves of
// one app. In production the client is built into dist/ and served by the API
// process itself; in development Vite proxies /api through to that same API.
// Either way the browser talks to a single origin, so there is no CORS.
export default defineConfig(({ mode }) => {
  const root = path.resolve(__dirname, "public");
  // Read the same .env the server uses, so ports are configured in one place.
  const env = loadEnv(mode, __dirname, "");
  const apiPort = Number(env.PORT) || 4000;
  const webPort = Number(env.WEB_PORT) || 5173;

  return {
    root,
    // Files copied to the build verbatim (favicon, icons) — everything else in
    // public/ is application source that Vite compiles.
    publicDir: path.resolve(root, "static"),
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
    envDir: __dirname,
    plugins: [react(), tailwindcss()],
    server: {
      port: webPort,
      strictPort: true, // never silently move — the link stays stable
      proxy: {
        "/api": { target: `http://localhost:${apiPort}`, changeOrigin: true },
      },
    },
    resolve: {
      alias: {
        "@": root,
        "#shared": path.resolve(__dirname, "server/shared"),
      },
    },
  };
});
