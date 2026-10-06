import { expect, test } from "@playwright/test";

// Expected Worker construction per app. Vite keeps `type: "module"`; webpack 5 (without
// output.module) compiles the worker into its own classic chunk and rewrites the type to undefined.
const apps = [
  { name: "vite build", url: "http://localhost:4301/", worker: /\/assets\/worker-[\w-]+\.js$/, type: "module" },
  { name: "webpack 5", url: "http://localhost:4302/", worker: /\/dist\/\d+\.main\.js$/, type: undefined },
  { name: "vite dev", url: "http://localhost:4303/", worker: /\/@mssio\/qpdf-wasm\/dist\/worker\.js\?/, type: "module" },
];

interface WorkerRecord {
  url: string;
  type: string | undefined;
}

interface SmokeResult {
  qpdfVersion: string;
  repeatedPages: number;
  mergedPages: number;
  encrypted: boolean;
  decryptedPages: number;
  wrongPasswordCode: string;
  jobMs: number;
  maxFrameGapMs: number;
}

for (const app of apps) {
  test(`${app.name}: runs qpdf in a worker with zero bundler config`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    // Record every Worker construction, then call through to the real Worker unchanged.
    await page.addInitScript(() => {
      const w = window as unknown as { Worker: typeof Worker; __qpdfWorkers: WorkerRecord[] };
      const RealWorker = w.Worker;
      w.__qpdfWorkers = [];
      w.Worker = class extends RealWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          w.__qpdfWorkers.push({ url: String(url), type: options?.type });
          super(url, options);
        }
      };
    });
    await page.goto(app.url);
    await page.waitForFunction(() => typeof (window as unknown as { qpdfSmoke?: unknown }).qpdfSmoke === "function");
    const r = await page.evaluate(() => (window as unknown as { qpdfSmoke: () => Promise<SmokeResult> }).qpdfSmoke());

    const workers = await page.evaluate(() => (window as unknown as { __qpdfWorkers: WorkerRecord[] }).__qpdfWorkers);

    expect(errors).toEqual([]);
    // qpdf must have run in a real Web Worker (no silent main-thread fallback).
    expect(workers.length).toBeGreaterThanOrEqual(1);
    expect(workers).toContainEqual({ url: expect.stringMatching(app.worker), type: app.type });
    expect(r.qpdfVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(r.repeatedPages).toBe(120);
    expect(r.mergedPages).toBe(9);
    expect(r.encrypted).toBe(true);
    expect(r.decryptedPages).toBe(9);
    expect(r.wrongPasswordCode).toBe("INVALID_PASSWORD");
    // The main thread must stay responsive while a long job runs (only meaningful if the job was long).
    if (r.jobMs > 300) expect(r.maxFrameGapMs).toBeLessThan(250);
  });
}
