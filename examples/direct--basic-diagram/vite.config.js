import { defineConfig } from "vite";
import { diagramWebkit } from "diagram-webkit/tools/vite";

export default defineConfig({
  plugins: [diagramWebkit({ definition: "./definition.js" })],
});
