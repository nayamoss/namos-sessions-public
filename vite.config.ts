import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the entry chunk, which was 561 kB — over Vite's 500 kB warning (#32).
        // These are the largest always-loaded dependencies; separating them also lets the
        // browser cache them independently of app code.
        // NOTE: Vite 8 builds with rolldown, which requires the FUNCTION form here.
        // The object form ({ "vendor-react": [...] }) fails with "manualChunks is not a function".
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tanstack")) return "vendor-query";
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return "vendor-react";
          }
          // No catch-all: returning a name for everything else would pull lazily-loaded
          // deps (tiptap, convex) into one eager chunk. Let Vite keep its default split.
          return undefined;
        },
      },
    },
  },
}));
