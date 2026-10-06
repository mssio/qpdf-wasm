#!/usr/bin/env node
// Verifies what `npm publish` would ship: required files present, sources and tests absent.
import { execFileSync } from "node:child_process";

const [{ files }] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }));
const paths = new Set(files.map((f) => f.path));

const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/worker.js",
  "dist/wasm/qpdf.mjs",
  "dist/wasm/qpdf.wasm",
  "dist/wasm/meta.mjs",
  "dist/wasm/meta.d.mts",
];
const missing = required.filter((p) => !paths.has(p));
const forbidden = [...paths].filter((p) => /^(src|test|vendor|build|scripts|examples|out)\//.test(p));

if (missing.length || forbidden.length) {
  if (missing.length) console.error(`Missing from package: ${missing.join(", ")}`);
  if (forbidden.length) console.error(`Must not be in package: ${forbidden.join(", ")}`);
  process.exit(1);
}
const wasm = files.find((f) => f.path === "dist/wasm/qpdf.wasm");
console.log(`package OK: ${files.length} files, qpdf.wasm ${(wasm.size / 1024 / 1024).toFixed(2)} MB`);
