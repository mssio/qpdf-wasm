import { beforeAll, describe, expect, it } from "vitest";
import { runJob } from "../../src/engine.js";
import { QpdfError } from "../../src/errors.js";
import { defaultWasmUrl, loadWasmModule } from "../../src/wasm-loader.js";
import { fixture } from "../helpers.js";

let wasm: WebAssembly.Module;
let form: Uint8Array;
let shared: Uint8Array;

beforeAll(async () => {
  wasm = await loadWasmModule(defaultWasmUrl());
  form = await fixture("form.pdf");
  shared = await fixture("shared-form-images.pdf");
});

describe("loadWasmModule", () => {
  it("compiles qpdf.wasm from a file: URL in Node", () => {
    expect(wasm).toBeInstanceOf(WebAssembly.Module);
  });
  it("rejects with QpdfError FAILED when the file does not exist", async () => {
    const err = await loadWasmModule(new URL("./missing.wasm", defaultWasmUrl())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QpdfError);
    expect((err as QpdfError).code).toBe("FAILED");
    expect((err as QpdfError).message).toContain("missing.wasm");
  });
});

describe("runJob", () => {
  it("returns stdout and exit code", async () => {
    const r = await runJob(wasm, { args: ["--show-npages", "in.pdf"], files: { "in.pdf": form } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("3");
    expect(r.files).toEqual({});
  });

  it("returns only files created by the run, by relative path", async () => {
    const r = await runJob(wasm, {
      args: ["--empty", "--pages", "a.pdf", "b.pdf", "--", "out.pdf"],
      files: { "a.pdf": form, "b.pdf": shared },
    });
    expect(r.exitCode).toBe(0);
    expect(Object.keys(r.files)).toEqual(["out.pdf"]);
  });

  it("supports nested input paths and collects nested outputs", async () => {
    const r = await runJob(wasm, { args: ["--split-pages", "docs/in.pdf", "docs/p-%d.pdf"], files: { "docs/in.pdf": form } });
    expect(r.exitCode).toBe(0);
    expect(Object.keys(r.files).sort()).toEqual(["docs/p-1.pdf", "docs/p-2.pdf", "docs/p-3.pdf"]);
  });

  it("reports qpdf failures through exitCode and stderr, without throwing", async () => {
    const r = await runJob(wasm, { args: ["--check", "missing.pdf"], files: {} });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("missing.pdf");
  });

  it("rejects paths containing ..", async () => {
    await expect(runJob(wasm, { args: [], files: { "../escape.pdf": form } })).rejects.toThrow(/invalid file path/);
  });

  it("isolates jobs: 50 sequential mixed jobs including --json all succeed", async () => {
    for (let i = 0; i < 50; i++) {
      const args = i % 2 === 0 ? ["--json", "--json-key=pages", "in.pdf"] : ["--check", "in.pdf"];
      const r = await runJob(wasm, { args, files: { "in.pdf": form } });
      expect(r.exitCode, `job ${i} (${args.join(" ")}): ${r.stderr}`).toBe(0);
      if (i % 2 === 0) expect(JSON.parse(r.stdout).pages).toHaveLength(3);
    }
  });
});
