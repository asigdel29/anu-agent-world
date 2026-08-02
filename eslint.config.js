import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "public", "dist-probe"] },

  // Plain JavaScript: config files only. These sit outside the TypeScript
  // project, so they get syntax-level rules but no type-aware ones.
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Engine code is world-agnostic by contract: the world is injected as a
  // config object, a manifest, a catalog, and a scene component. Re-theming the
  // site must not require touching the engine, so the boundary is enforced here
  // rather than left to reviewer discipline.
  {
    files: ["src/engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/world/**", "../world/*", "../../world/*"],
              message:
                "engine/ must not import from world/. Inject the world through WorldConfig, the chunk manifest, the prop catalog, or a scene component instead.",
            },
          ],
        },
      ],
    },
  },

  // Type-aware linting. `projectService` resolves each file to its owning
  // tsconfig, which lets rules reason about real types: floating promises,
  // unsafe `any` flowing through call sites, and misused promises in event
  // handlers are all invisible to syntax-only linting and all bite in a frame
  // loop or a network handler.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // Server and shared modules run outside the browser; a `window` reference
  // here is a bug, so the browser globals are deliberately absent.
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "protocol/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
);
