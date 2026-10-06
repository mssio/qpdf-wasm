import { beforeEach, describe, expect, it } from "vitest";
import { createQpdfApi } from "../../src/api.js";
import { QpdfError } from "../../src/errors.js";
import { defaultWasmUrl } from "../../src/wasm-loader.js";
import { createWorkerPool } from "../../src/worker-pool.js";
import { fixture } from "../helpers.js";
import { FakeWorker } from "../unit/fake-worker.js";

const wasmUrl = defaultWasmUrl().href;
const pool = (size = 1) => createWorkerPool({ size, wasmUrl, spawn: () => new FakeWorker() });

beforeEach(() => {
  FakeWorker.spawned = 0;
});

describe("worker pool", () => {
  it("runs jobs in the worker", async () => {
    const qpdf = createQpdfApi(await pool());
    expect((await qpdf.info(await fixture("form.pdf"))).pageCount).toBe(3);
    qpdf.terminate();
  });

  it("starts `size` workers", async () => {
    const executor = await pool(3);
    expect(FakeWorker.spawned).toBe(3);
    executor.terminate();
  });

  it("keeps each concurrent result with its own call", async () => {
    for (const size of [1, 2]) {
      const qpdf = createQpdfApi(await pool(size));
      const inputs = ["form.pdf", "shared-form-images.pdf", "form.pdf", "shared-form-images.pdf", "form.pdf"];
      const counts = await Promise.all(inputs.map(async (name) => (await qpdf.info(await fixture(name))).pageCount));
      expect(counts).toEqual([3, 6, 3, 6, 3]);
      qpdf.terminate();
    }
  });

  it("merges the same buffer twice (deduplicated transfer list)", async () => {
    const qpdf = createQpdfApi(await pool());
    const form = await fixture("form.pdf");
    const { output } = await qpdf.merge([form, form]);
    expect((await qpdf.info(output)).pageCount).toBe(6);
    qpdf.terminate();
  });

  it("explains reuse of an input that was transferred", async () => {
    const qpdf = createQpdfApi(await pool());
    const form = await fixture("form.pdf");
    await qpdf.info(form);
    await expect(qpdf.info(form)).rejects.toThrow(/detached.*slice\(\)/);
    qpdf.terminate();
  });

  it("keeps the caller's bytes usable when they pass a copy", async () => {
    const qpdf = createQpdfApi(await pool());
    const form = await fixture("form.pdf");
    await qpdf.info(form.slice());
    expect((await qpdf.info(form)).pageCount).toBe(3);
    qpdf.terminate();
  });

  it("rejects the crashed job with FAILED, replaces the worker, and keeps working", async () => {
    const executor = await pool();
    const qpdf = createQpdfApi(executor);
    const err = await executor.exec({ args: ["--crash"], files: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QpdfError);
    expect((err as QpdfError).code).toBe("FAILED");
    expect((err as QpdfError).message).toContain("simulated crash");
    expect((await qpdf.info(await fixture("form.pdf"))).pageCount).toBe(3);
    expect(FakeWorker.spawned).toBe(2);
    qpdf.terminate();
  });

  it("rejects in-flight, queued and later jobs with TERMINATED", async () => {
    const executor = await pool();
    const form = await fixture("form.pdf");
    const a = executor.exec({ args: ["--check", "a.pdf"], files: { "a.pdf": form.slice() } });
    const b = executor.exec({ args: ["--check", "b.pdf"], files: { "b.pdf": form.slice() } });
    executor.terminate();
    for (const p of [a, b, executor.exec({ args: ["--version"], files: {} })]) {
      const err = await p.catch((e: unknown) => e);
      expect((err as QpdfError).code).toBe("TERMINATED");
    }
  });

  it("rejects a second concurrent call with the same buffer clearly and keeps working", async () => {
    for (const size of [1, 2]) {
      const qpdf = createQpdfApi(await pool(size));
      const form = await fixture("form.pdf");
      const [a, b] = await Promise.allSettled([qpdf.info(form), qpdf.info(form)]);
      expect(a.status).toBe("fulfilled");
      expect((a as PromiseFulfilledResult<{ pageCount: number }>).value.pageCount).toBe(3);
      expect(b.status).toBe("rejected");
      expect(String((b as PromiseRejectedResult).reason)).toMatch(/detached.*slice\(\)/);
      expect((await qpdf.info(await fixture("form.pdf"))).pageCount).toBe(3);
      qpdf.terminate();
    }
  });

  it("fails to start with FAILED when the wasm cannot be loaded", async () => {
    const bad = new URL("./missing.wasm", defaultWasmUrl()).href;
    const err = await createWorkerPool({ size: 1, wasmUrl: bad, spawn: () => new FakeWorker() }).catch((e: unknown) => e);
    expect((err as QpdfError).code).toBe("FAILED");
    expect((err as QpdfError).message).toContain("missing.wasm");
  });

  it("explains a worker script that could not be loaded (error event without a message)", async () => {
    class UnloadableWorker extends FakeWorker {
      override postMessage(): void {
        queueMicrotask(() => this.onerror?.({ type: "error" }));
      }
    }
    const workerUrl = "https://app.example/assets/worker-abc123.js";
    const err = await createWorkerPool({ size: 1, wasmUrl, workerUrl, spawn: () => new UnloadableWorker() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QpdfError);
    expect((err as QpdfError).code).toBe("FAILED");
    expect((err as QpdfError).message).toBe(
      `qpdf worker failed to start (could not load ${workerUrl}); check that the worker script is served and allowed by your Content-Security-Policy (worker-src)`,
    );
  });
});
