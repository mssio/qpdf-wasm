#!/usr/bin/env node
// README.md must embed every examples/*.mjs verbatim. The examples are executed by
// test/node/recipes.test.ts, so documented code cannot silently rot.
import { readdirSync, readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const recipes = readdirSync("examples").filter((f) => f.endsWith(".mjs"));
const missing = recipes.filter((f) => !readme.includes(readFileSync(`examples/${f}`, "utf8").trim()));
for (const sentence of ["This software is based in part on the work of the Independent JPEG Group."]) {
  if (!readme.includes(sentence)) missing.push(`required sentence: "${sentence}"`);
}
if (missing.length) {
  console.error(`README.md is out of sync with: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`README recipes in sync (${recipes.length} recipes)`);
