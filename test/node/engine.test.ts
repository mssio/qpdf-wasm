import { beforeAll, describe, expect, it } from "vitest";
import { runJob } from "../../src/engine.js";
import { QpdfError } from "../../src/errors.js";
import { createInlineExecutor } from "../../src/inline-executor.js";
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

  it("does not return inputs given with ./ or // as outputs", async () => {
    const r = await runJob(wasm, {
      args: ["--check", "a.pdf"],
      files: { "./a.pdf": form, "docs//b.pdf": shared },
    });
    expect(r.exitCode).toBe(0);
    expect(r.files).toEqual({});
  });

  it("rejects empty and directory-like paths", async () => {
    for (const name of ["", ".", "/work", "/work/"]) {
      await expect(runJob(wasm, { args: [], files: { [name]: form } })).rejects.toThrow(/invalid file path/);
    }
  });

  it("rejects .. in the middle of a path", async () => {
    await expect(runJob(wasm, { args: [], files: { "a/../b.pdf": form } })).rejects.toThrow(/invalid file path/);
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

describe("inline executor", () => {
  // A valid wasm module that imports a function qpdf's glue does not provide: instantiation fails with a LinkError.
  const unlinkable = new WebAssembly.Module(
    new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // header
      0x01, 0x04, 0x01, 0x60, 0x00, 0x00, // type section: () -> ()
      0x02, 0x0f, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x07, 0x6d, 0x69, 0x73, 0x73, 0x69, 0x6e, 0x67, 0x00, 0x00, // import env.missing
    ]),
  );

  it("rejects a wasm failure with QpdfError FAILED instead of a raw WebAssembly error", async () => {
    const err = await createInlineExecutor(unlinkable)
      .exec({ args: ["--version"], files: {} })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QpdfError);
    expect((err as QpdfError).code).toBe("FAILED");
    expect((err as QpdfError).message).toMatch(/^qpdf crashed: /);
  });

  it("passes QpdfErrors through unchanged", async () => {
    const err = await createInlineExecutor(wasm)
      .exec({ args: [], files: { "../escape.pdf": form } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QpdfError);
    expect((err as QpdfError).message).toBe("invalid file path: ../escape.pdf");
  });
});
