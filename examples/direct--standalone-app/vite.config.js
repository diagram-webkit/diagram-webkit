import { defineConfig } from "vite";
import { diagramWebkit } from "diagram-webkit/tools/vite";

export default defineConfig({
  base: "./",
  plugins: [
    diagramWebkit({
      page: { title: "diagram-webkit", description: "Open a draw.io SVG and explore it. Runs in the browser; nothing is uploaded." },
      singleFile: true, // dist/index.html is the whole app: host it, or open it from disk
    }),
  ],
});
