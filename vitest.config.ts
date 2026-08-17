import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "packages/**/*.{test,spec}.{ts,tsx}", "worker/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      // Test workspace packages against source, not their built dist/ — CI runs `npm run
      // test` without ever building packages/sdk first, so resolving through the package's
      // published entry point (which points at dist/) fails on a clean checkout.
      "@namos-sessions/sdk": path.resolve(rootDir, "./packages/sdk/src/index.ts"),
    },
  },
});
