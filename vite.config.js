import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      deny: [
        "**/.env",
        "**/.env.*",
        "**/.git/**",
        "**/data/**",
        "**/server/**",
        "**/tests/**",
        "**/qa/**",
        "**/*.sqlite",
        "**/*.sqlite-*",
      ],
    },
  },
  build: { chunkSizeWarningLimit: 700 },
});
