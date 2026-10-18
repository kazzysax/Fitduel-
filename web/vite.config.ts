import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // The web app imports the shared simulation engine from ../engine.
    fs: { allow: [".."] },
    // In development the API runs separately (npm run server at the repo root).
    proxy: { "/api": "http://localhost:8787" },
  },
});
