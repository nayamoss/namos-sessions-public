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
      // New in eslint-plugin-react-hooks v7. Flags ~130 pre-existing
      // `useEffect(() => { void load(); }, [load])` sites app-wide — a real,
      // worthwhile refactor, but a separate one from this dependency bump.
      // Tracked as follow-up work, not silenced permanently.
      "react-hooks/set-state-in-effect": "off",
    },
  },
);
