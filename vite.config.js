import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: [
        "**/.git/**",
        "**/dist/**",
        "**/venv/**",
        "**/.venv/**",
        "**/__pycache__/**",
        "**/*.pyc",
        "**/bananaflow/**",
      ],
    },
  },
});
