import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

// Vite inlines VITE_* at build time from .env files, and .env is git-ignored. A build run
// anywhere without one — a fresh clone, CI, or the detached worktree the deploy instructions
// tell you to build from — produced a bundle with no Convex URL, and every page white-screened
// with "VITE_CONVEX_URL is required". That shipped to production on 2026-08-16.
//
// wrangler.jsonc is the checked-in source of truth that scripts/deploy-cloudflare.mjs already
// reads, so fall back to it whenever the environment does not supply a value, and fail the
// build outright if a value is still missing. There is deliberately no way to opt out: a
// bundle without these is not a working site, so it must not be possible to produce one.
const INLINED_AT_BUILD = ["VITE_CONVEX_URL", "VITE_CLERK_PUBLISHABLE_KEY", "VITE_TURNSTILE_SITE_KEY"] as const;

function buildTimeDefines(mode: string) {
  const env = loadEnv(mode, projectDir, "VITE_");
  const wranglerVars: Record<string, string> = JSON.parse(
    readFileSync(path.resolve(projectDir, "wrangler.jsonc"), "utf8"),
  ).vars ?? {};
  const defines: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of INLINED_AT_BUILD) {
    if (env[key]) continue;
    if (wranglerVars[key]) defines[`import.meta.env.${key}`] = JSON.stringify(wranglerVars[key]);
    else missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(
      `Cannot build: ${missing.join(", ")} is not set and has no value in wrangler.jsonc "vars". ` +
        "A bundle without it white-screens every page.",
    );
  }
  return defines;
}

export default defineConfig(({ mode }) => ({
  define: buildTimeDefines(mode),
  server: {
    host: "::",
    port: 8080,
    // Fail instead of silently moving to 8081, 8082, … when 8080 is taken. Several
    // worktrees of this repo run side by side; Vite's default port-hunting meant each
    // one quietly started its own server, so a browser session signed in against one
    // port never matched the app being edited on another. A hard failure is the signal
    // to reuse the server that is already running.
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(projectDir, "./src"),
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
