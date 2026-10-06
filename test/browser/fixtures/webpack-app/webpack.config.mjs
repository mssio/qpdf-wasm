import { fileURLToPath } from "node:url";

// Plain webpack 5 production config. No qpdf-specific configuration.
export default {
  mode: "production",
  entry: "./main.js",
  output: { path: fileURLToPath(new URL("./dist", import.meta.url)), filename: "main.js", clean: true },
};
