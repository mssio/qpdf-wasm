#!/usr/bin/env node
// Minimal static server for browser tests: node scripts/serve-static.mjs <port> <root> [<root>...]
// The first root containing the path wins. .wasm is served as application/wasm.
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const [port, ...roots] = process.argv.slice(2);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  for (const root of roots.map((r) => resolve(r))) {
    const file = resolve(join(root, relative));
    if (file !== root && !file.startsWith(root + sep)) continue;
    try {
      if ((await stat(file)).isFile()) {
        res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
        res.end(await readFile(file));
        return;
      }
    } catch {
      // try the next root
    }
  }
  res.writeHead(404).end("not found");
}).listen(Number(port), () => console.log(`serving ${roots.join(", ")} at http://localhost:${port}/`));
