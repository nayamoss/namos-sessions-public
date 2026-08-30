import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".worktrees/**", "convex/_generated/**", "worker-configuration.d.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": "off",
      // New in eslint-plugin-react-hooks v7 (React Compiler compatibility rules —
      // this app doesn't use the compiler today, but the rules still ship in
      // `recommended`). Each flags a real, pre-existing pattern app-wide; each is a
      // worthwhile refactor, but a separate one from this dependency bump. Tracked
      // as follow-up work, not silenced permanently.
      // - set-state-in-effect: ~130 `useEffect(() => { void load(); }, [load])` sites.
      "react-hooks/set-state-in-effect": "off",
      // - purity: Date.now() called inline inside otherwise-memoized render paths
      //   (Readiness.tsx, Recordings.tsx, Speakers.tsx, ActivityLog.tsx) — needs a
      //   real "current time" pattern (ref/state), not a call-site-by-call-site edit.
      "react-hooks/purity": "off",
      // - preserve-manual-memoization: EventTeam.tsx's useCallback deps are more
      //   specific than what the compiler infers (user?.id vs user) — needs the
      //   dependency array reworked, not just silenced at this one call site.
      "react-hooks/preserve-manual-memoization": "off",
      // - refs: SettingsModalContext.tsx and OnboardingWizard.tsx read/write a ref's
      //   `.current` during render (a "remember the last real value across a
      //   remount" pattern) — needs restructuring around an effect, not a quick fix.
      "react-hooks/refs": "off",
    },
  },
);
