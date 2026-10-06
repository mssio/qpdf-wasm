import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@mssio/qpdf-wasm": fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
  },
  test: {
    include: ["test/unit/**/*.test.ts", "test/node/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
});
