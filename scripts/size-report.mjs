#!/usr/bin/env node
// Prints the gzip size of dist/wasm/qpdf.wasm and compares it with the latest published version.
// Non-blocking: emits a GitHub Actions warning if it grew more than 10%.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const gzipSize = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const current = gzipSize("dist/wasm/qpdf.wasm");
let published = null;
const dir = mkdtempSync(join(tmpdir(), "qpdf-size-"));
try {
  const out = execFileSync("npm", ["pack", "@mssio/qpdf-wasm@latest", "--json", "--pack-destination", dir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const [{ filename }] = JSON.parse(out);
  execFileSync("tar", ["-xzf", join(dir, filename), "-C", dir, "package/dist/wasm/qpdf.wasm"]);
  published = gzipSize(join(dir, "package/dist/wasm/qpdf.wasm"));
} catch {
  // not published yet, or offline
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (published === null) {
  console.log(`qpdf.wasm gzip: ${kb(current)} (no published version to compare)`);
} else {
  const change = ((current - published) / published) * 100;
  const line = `qpdf.wasm gzip: ${kb(current)} (published: ${kb(published)}, ${change >= 0 ? "+" : ""}${change.toFixed(1)}%)`;
  console.log(line);
  if (change > 10) console.log(`::warning title=qpdf.wasm size::${line}: grew more than 10%`);
}
