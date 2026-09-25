import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const STYLE_FILES = ["runtime", "panel", "tooltip", "modals", "annotations", "feedback"];

// The runtime adopts these itself; dist/styles.css is for pages that prefer
// a <link>.
function stylesheet(): Plugin {
  return {
    name: "diagram-webkit-stylesheet",
    generateBundle() {
      const source = STYLE_FILES.map((name) => fs.readFileSync(path.resolve(__dirname, `src/ui/styles/${name}.css`), "utf8")).join("\n");
      this.emitFile({ type: "asset", fileName: "styles.css", source });
    },
  };
}

export default defineConfig({
  plugins: [stylesheet()],
  build: {
    target: "es2022",
    sourcemap: true,
    lib: {
      entry: {
        index: "src/index.ts",
        core: "src/core/index.ts",
        reveal: "src/reveal/index.ts",
      },
      formats: ["es"],
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      thresholds: { lines: 90 },
    },
  },
});
