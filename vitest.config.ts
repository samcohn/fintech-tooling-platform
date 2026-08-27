import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["platform/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@platform": fileURLToPath(new URL("./platform", import.meta.url)),
      "@apps": fileURLToPath(new URL("./apps", import.meta.url)),
    },
  },
});
