import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        window: "readonly",
        document: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        localStorage: "readonly",
        console: "readonly",
        navigator: "readonly",
        require: "readonly",
        Node: "readonly",
        NodeJS: "readonly",
        MutationObserver: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLStyleElement: "readonly",
        Element: "readonly",
        Event: "readonly",
        MouseEvent: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        createDiv: "readonly",
        createSpan: "readonly",
        createEl: "readonly",
        confirm: "readonly",
        prompt: "readonly",
      },
    },
    rules: {
      "obsidianmd/sample-names": "off",
      "@typescript-eslint/require-await": "error",
      "import/no-extraneous-dependencies": ["error", { peerDependencies: true }],
    },
  },
]);
