import { QpdfError } from "./errors.js";

/** Default location: next to this module (dist/wasm/qpdf.wasm). Bundlers rewrite this pattern. */
export function defaultWasmUrl(): URL {
  return new URL("./wasm/qpdf.wasm", import.meta.url);
}

export function resolveWasmUrl(url?: string | URL): URL {
  if (url === undefined) return defaultWasmUrl();
  if (url instanceof URL) return url;
  const base = (globalThis as { location?: { href: string } }).location?.href ?? import.meta.url;
  return new URL(url, base);
}

export async function loadWasmModule(url: string | URL): Promise<WebAssembly.Module> {
  const href = resolveWasmUrl(url);
  try {
    if (href.protocol === "file:") return await compileFromFile(href);
    const response = await fetch(href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.headers.get("content-type")?.startsWith("application/wasm")) {
      return await WebAssembly.compileStreaming(response);
    }
    return await WebAssembly.compile(await response.arrayBuffer());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new QpdfError("FAILED", `failed to load qpdf.wasm from ${href.href}: ${reason}`);
  }
}

interface NodeFs {
  readFile(path: URL): Promise<Uint8Array<ArrayBuffer>>;
}

// process.getBuiltinModule (Node >= 20.16) avoids any import statement bundlers could see.
async function compileFromFile(url: URL): Promise<WebAssembly.Module> {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const fs = proc?.getBuiltinModule?.("node:fs/promises") as NodeFs | undefined;
  if (!fs) throw new Error("file: URLs are only supported in Node.js >= 20.16");
  return WebAssembly.compile(await fs.readFile(url));
}
