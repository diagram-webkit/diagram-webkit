import { defineConfig } from "vite";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, "..");

// Test pages import the package source directly; examples are tested
// against their own builds.
export default defineConfig({
  root: path.join(here, "pages"),
  resolve: {
    alias: [{ find: /^diagram-webkit$/, replacement: path.join(repo, "packages/diagram-webkit/src/index.ts") }],
  },
  server: { host: "127.0.0.1", port: 4100, strictPort: true, fs: { allow: [repo] } },
  logLevel: "warn",
});
