import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The web app imports the shared simulation engine from ../engine.
  server: { fs: { allow: [".."] } },
});
