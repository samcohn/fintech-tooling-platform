import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["kernel/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@kernel": fileURLToPath(new URL("./kernel", import.meta.url)),
      "@apps": fileURLToPath(new URL("./apps", import.meta.url)),
      "@platform": fileURLToPath(new URL("./platform", import.meta.url)),
    },
  },
});
