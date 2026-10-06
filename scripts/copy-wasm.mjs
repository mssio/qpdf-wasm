#!/usr/bin/env node
// Copies the generated wasm artifacts and their declarations from src/wasm into dist/wasm.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const files = ["qpdf.mjs", "qpdf.wasm", "meta.mjs", "qpdf.d.mts", "meta.d.mts"];
mkdirSync("dist/wasm", { recursive: true });
for (const file of files) {
  const source = `src/wasm/${file}`;
  if (!existsSync(source)) {
    console.error(`${source} is missing: run "npm run build:wasm" first`);
    process.exit(1);
  }
  cpSync(source, `dist/wasm/${file}`);
}
console.log(`copied ${files.length} files to dist/wasm`);
