import js from "@eslint/js";
import globals from "globals";

// TypeScript files are checked by tsc (TS 7); typescript-eslint does not
// support TS 7 yet, so ESLint covers the JavaScript sources only.
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "test-results/**",
      "playwright-report/**",
      "**/coverage/**",
      "**/*.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["packages/diagram-webkit/src/**/*.js", "examples/**/*.js", "e2e/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: [
      "packages/diagram-webkit/src/tools/**/*.js",
      "scripts/**/*.mjs",
      "packages/diagram-webkit/test/**/*.mjs",
      "**/vite.config.js",
      "eslint.config.js",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["packages/diagram-webkit/src/dom/**/*.js", "packages/diagram-webkit/src/ui/**/*.js", "packages/diagram-webkit/src/adapters/**/*.js"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "document", message: "Use the instance's ownerDocument or root." },
        { name: "localStorage", message: "Use adapters/storage.js." },
        { name: "history", message: "Use adapters/url-sync.js." },
        { name: "location", message: "Use adapters/url-sync.js." },
      ],
    },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
];
