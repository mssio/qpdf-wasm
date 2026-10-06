import { fileURLToPath } from "node:url";

// Plain webpack 5 production config. No qpdf-specific configuration.
export default {
  mode: "production",
  entry: "./main.js",
  output: { path: fileURLToPath(new URL("./dist", import.meta.url)), filename: "main.js", clean: true },
  // Fixture plumbing: webpack >= 5.106 reads the nearest tsconfig.json, which here is the repo's own,
  // whose `paths` maps @mssio/qpdf-wasm to src/. Disable it so the installed tarball is what gets tested.
  resolve: { tsconfig: false },
};
