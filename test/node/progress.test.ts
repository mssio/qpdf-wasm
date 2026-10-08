import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createQpdfApi } from "../../src/api.js";
import { createQpdf, type Qpdf } from "../../src/index.js";
import { defaultWasmUrl } from "../../src/wasm-loader.js";
import { createWorkerPool } from "../../src/worker-pool.js";
import { imageHeavyPdf } from "../browser/image-heavy-pdf.js";
import { fixture } from "../helpers.js";
import { FakeWorker } from "../unit/fake-worker.js";

let qpdf: Qpdf;
/** 20 pages, ~9.8 MB: qpdf reports ~60 distinct percents while encrypting it. */
let big: Uint8Array;

beforeAll(async () => {
  qpdf = await createQpdf({ inline: true });
  big = imageHeavyPdf(20);
});
afterAll(() => qpdf.terminate());

const PROGRESS_TEXT = /write progress/;

function recorder() {
  const percents: number[] = [];
  return { percents, onProgress: (percent: number) => void percents.push(percent) };
}

/** Spec §3: integers, strictly increasing, 100 last. */
function expectIncreasingTo100(percents: number[]): void {
  expect(percents.at(-1)).toBe(100);
  percents.forEach((percent, index) => {
    expect(Number.isInteger(percent)).toBe(true);
    if (index > 0) expect(percent).toBeGreaterThan(percents[index - 1]!);
  });
}

/** As above, starting at 0 (everything except linearize, whose first value can be above 0). */
function expectRising(percents: number[]): void {
  expect(percents[0]).toBe(0);
  expectIncreasingTo100(percents);
}

describe("onProgress (inline)", () => {
  it("reports encrypt progress rising from 0 to 100", async () => {
    const { percents, onProgress } = recorder();
    const { output, warnings } = await qpdf.encrypt(big.slice(), { userPassword: "u", ownerPassword: "o", onProgress });
    expectRising(percents);
    expect(percents.length).toBeGreaterThanOrEqual(50);
    expect(warnings).toEqual([]);
    expect((await qpdf.info(output, { password: "u" })).encrypted).toBe(true);
  });

  it("drops linearize's repeated values (linearize can start above 0)", async () => {
    const { percents, onProgress } = recorder();
    await qpdf.linearize(big.slice(), { onProgress });
    expectIncreasingTo100(percents);
  });

  it("starts again at 0 for each split output file", async () => {
    const { percents, onProgress } = recorder();
    const { outputs } = await qpdf.split(imageHeavyPdf(6, 300), { pagesPerFile: 2, onProgress });
    expect(outputs).toHaveLength(3);
    const runs: number[][] = [];
    for (const percent of percents) {
      if (percent === 0) runs.push([]);
      runs.at(-1)!.push(percent);
    }
    expect(runs).toHaveLength(3);
    runs.forEach(expectRising);
  });

  it("keeps linearized split outputs after the first (they start above 0)", async () => {
    const { percents, onProgress } = recorder();
    const result = await qpdf.run(["in.pdf", "--split-pages=2", "--linearize", "s-%d.pdf"], {
      files: { "in.pdf": imageHeavyPdf(6, 300) },
      onProgress,
    });
    expect(result.exitCode).toBe(0);
    expect(Object.keys(result.files)).toHaveLength(3);
    const runs: number[][] = [];
    percents.forEach((percent, index) => {
      if (index === 0 || percent < percents[index - 1]!) runs.push([]);
      runs.at(-1)!.push(percent);
    });
    expect(runs).toHaveLength(3);
    runs.forEach(expectIncreasingTo100);
  });

  it("leaves a sole help option alone: no --progress is prepended", async () => {
    const onProgress = vi.fn();
    const result = await qpdf.run(["--version"], { onProgress });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/qpdf version/);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("still reports progress for a sole --job-json-file", async () => {
    const { percents, onProgress } = recorder();
    const result = await qpdf.run(["--job-json-file=job.json"], {
      files: {
        "in.pdf": await fixture("form.pdf"),
        "job.json": new TextEncoder().encode(JSON.stringify({ inputFile: "in.pdf", outputFile: "out.pdf" })),
      },
      onProgress,
    });
    expect(result.exitCode).toBe(0);
    expectRising(percents);
  });

  it("keeps progress lines out of run()'s stdout and stderr", async () => {
    const { percents, onProgress } = recorder();
    const result = await qpdf.run(["--encrypt", "u", "o", "256", "--", "in.pdf", "out.pdf"], {
      files: { "in.pdf": big.slice() },
      onProgress,
    });
    expect(result.exitCode).toBe(0);
    expectRising(percents);
    expect(result.stdout).not.toMatch(PROGRESS_TEXT);
    expect(result.stderr).not.toMatch(PROGRESS_TEXT);
  });

  it("reports and strips the progress qpdf sends to stderr when the PDF goes to stdout", async () => {
    const { percents, onProgress } = recorder();
    const result = await qpdf.run(["in.pdf", "-"], { files: { "in.pdf": await fixture("form.pdf") }, onProgress });
    expect(result.exitCode).toBe(0);
    expectRising(percents);
    expect(result.stderr).not.toMatch(PROGRESS_TEXT);
  });

  it("leaves a caller's own --progress lines in stdout when onProgress is not set (1.0.0 behaviour)", async () => {
    const result = await qpdf.run(["--progress", "in.pdf", "out.pdf"], { files: { "in.pdf": await fixture("form.pdf") } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/write progress: 100%/);
  });

  it("accepts a caller's own --progress together with onProgress", async () => {
    const { percents, onProgress } = recorder();
    const result = await qpdf.run(["--progress", "in.pdf", "out.pdf"], {
      files: { "in.pdf": await fixture("form.pdf") },
      onProgress,
    });
    expect(result.exitCode).toBe(0);
    expectRising(percents);
    expect(result.stdout).not.toMatch(PROGRESS_TEXT);
  });

  it("never calls onProgress for a run that writes no PDF", async () => {
    const onProgress = vi.fn();
    const result = await qpdf.run(["--check", "in.pdf"], { files: { "in.pdf": await fixture("form.pdf") }, onProgress });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^checking in\.pdf$/m);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("returns the same warnings for a damaged file with progress on", async () => {
    const damaged = await fixture("damaged.pdf");
    const without = await qpdf.compress(damaged.slice());
    const { percents, onProgress } = recorder();
    const withProgress = await qpdf.compress(damaged.slice(), { onProgress });
    expect(withProgress.warnings.join("\n")).toContain("file is damaged");
    expect(withProgress.warnings).toEqual(without.warnings);
    expect(percents.at(-1)).toBe(100);
  });

  it("keeps running when onProgress throws, and rethrows asynchronously", async () => {
    const scheduled = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {});
    let rethrows = 0;
    try {
      const { output } = await qpdf.encrypt(big.slice(), {
        userPassword: "u",
        ownerPassword: "o",
        onProgress: () => {
          throw new Error("callback bug");
        },
      });
      rethrows = scheduled.mock.calls.length;
      expect((await qpdf.info(output, { password: "u" })).encrypted).toBe(true);
    } finally {
      scheduled.mockRestore();
    }
    expect(rethrows).toBeGreaterThanOrEqual(50);
  });

  it("stops calling onProgress after terminate()", async () => {
    const own = await createQpdf({ inline: true });
    const percents: number[] = [];
    // Inline terminate() cannot abort the running job, so it still resolves; only the callback goes quiet.
    await own.encrypt(big.slice(), {
      userPassword: "u",
      ownerPassword: "o",
      onProgress: (percent) => {
        percents.push(percent);
        if (percent >= 10) own.terminate();
      },
    });
    expect(percents.at(-1)).toBeGreaterThanOrEqual(10);
    expect(percents.filter((percent) => percent >= 10)).toHaveLength(1);
  });
});

describe("onProgress (worker protocol, real wasm)", () => {
  it("posts no progress messages when onProgress is not set (1.0.0 behaviour)", async () => {
    const worker = new FakeWorker();
    const types: string[] = [];
    const pooled = createQpdfApi(
      await createWorkerPool({ size: 1, wasmUrl: defaultWasmUrl().href, spawn: () => worker }),
    );
    try {
      const original = worker.onmessage!;
      worker.onmessage = (event) => {
        types.push(event.data.type);
        original(event);
      };
      await pooled.encrypt(big.slice(), { userPassword: "u", ownerPassword: "o" });
      expect(types).toContain("result");
      expect(types).not.toContain("progress");
    } finally {
      pooled.terminate();
    }
  });

  it("streams encrypt progress from the worker, all before the result", async () => {
    const pooled = createQpdfApi(
      await createWorkerPool({ size: 1, wasmUrl: defaultWasmUrl().href, spawn: () => new FakeWorker() }),
    );
    try {
      const { percents, onProgress } = recorder();
      let atSettle = -1;
      await pooled
        .encrypt(big.slice(), { userPassword: "u", ownerPassword: "o", onProgress })
        .then(() => {
          atSettle = percents.length;
        });
      await new Promise((resolve) => setTimeout(resolve, 50)); // let any stray message arrive
      expect(percents.length).toBe(atSettle);
      expectRising(percents);
      expect(percents.length).toBeGreaterThanOrEqual(50);
    } finally {
      pooled.terminate();
    }
  });
});
