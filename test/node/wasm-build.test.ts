import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import createQpdfModule from "../../src/wasm/qpdf.mjs";
import { emscriptenVersion, qpdfVersion } from "../../src/wasm/meta.mjs";
import { compileWasm } from "../helpers.js";

describe("wasm build", () => {
  it("records the qpdf version of the submodule and the pinned Emscripten", () => {
    const cmake = readFileSync(new URL("../../vendor/qpdf/CMakeLists.txt", import.meta.url), "utf8");
    expect(cmake).toContain(`VERSION ${qpdfVersion}`);
    const pin = readFileSync(new URL("../../build/emsdk-version", import.meta.url), "utf8").trim();
    expect(emscriptenVersion).toBe(pin);
  });

  it("runs qpdf --version through the web-only glue in Node", async () => {
    const wasm = await compileWasm();
    const out: string[] = [];
    const mod = await createQpdfModule({
      thisProgram: "qpdf",
      print: (line) => out.push(line),
      instantiateWasm(imports, ready) {
        void WebAssembly.instantiate(wasm, imports).then((instance) => ready(instance, wasm));
        return {};
      },
    });
    let code: number | undefined;
    try {
      code = mod.callMain(["--version"]);
    } catch (e) {
      code = (e as { status: number }).status;
    }
    expect(code ?? 0).toBe(0);
    expect(out[0]).toBe(`qpdf version ${qpdfVersion}`);
  });

  it("ships third-party notices for qpdf, zlib and libjpeg", () => {
    const notices = readFileSync(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
    expect(notices).toContain(`qpdf ${qpdfVersion}`);
    expect(notices).toContain("Apache License");
    expect(notices).toContain("Jean-loup Gailly and Mark Adler");
    expect(notices).toContain("Independent JPEG Group");
  });
});
