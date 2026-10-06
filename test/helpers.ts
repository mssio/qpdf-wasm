import { readFile } from "node:fs/promises";

export async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(`./fixtures/${name}`, import.meta.url)));
}

export async function compileWasm(): Promise<WebAssembly.Module> {
  return WebAssembly.compile(await readFile(new URL("../src/wasm/qpdf.wasm", import.meta.url)));
}
