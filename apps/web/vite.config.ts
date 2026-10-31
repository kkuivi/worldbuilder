import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8791",
      "/ws": { target: "ws://127.0.0.1:8791", ws: true },
      "/health": "http://127.0.0.1:8791",
    },
  },
});
