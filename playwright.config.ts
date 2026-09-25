import { defineConfig, devices } from "@playwright/test";

// Examples are built and served from their own projects, against the
// package's dist (run `npm run build` first).
function example(folder: string, port: number) {
  return {
    command: `cd examples/${folder} && npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
  };
}

export const PORTS = { app: 4101, via: 4102, split: 4103 } as const;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: [
    { command: "npx vite --config e2e/vite.config.ts", port: 4100, reuseExistingServer: !process.env.CI },
    ...(process.env.E2E_EMBED_ONLY === "1"
      ? []
      : [
          example("direct--basic-diagram", PORTS.app),
          example("via--revealjs--on-basic-diagram", PORTS.via),
          example("split--revealjs--on-basic-diagram", PORTS.split),
        ]),
  ],
  projects: [
    { name: "embed", testDir: "e2e/embed", use: { baseURL: "http://127.0.0.1:4100" } },
    { name: "features", testDir: "e2e/features", use: { baseURL: `http://127.0.0.1:${PORTS.app}` } },
    { name: "reveal", testDir: "e2e/reveal", use: { baseURL: `http://127.0.0.1:${PORTS.via}` } },
  ],
});
