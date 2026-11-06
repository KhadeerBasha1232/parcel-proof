import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import basicSsl from "@vitejs/plugin-basic-ssl"
import { defineConfig } from "vite"

const backend = "http://127.0.0.1:8000"

// `vite --mode https` serves over https with a self-signed cert. Phones need
// https for live camera scanning and GPS when opening the app over your LAN IP.
// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "https" ? [basicSsl()] : [])],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: true, xfwd: true },
      "/uploads": { target: backend, changeOrigin: true },
    },
  },
}))
