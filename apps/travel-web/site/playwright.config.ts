import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173/travel-marketplace/",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [375, 768, 1280].map((width) => ({
    name: `${width}px`,
    use: { viewport: { width, height: 900 } },
  })),
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/travel-marketplace/",
    reuseExistingServer: true,
  },
});
