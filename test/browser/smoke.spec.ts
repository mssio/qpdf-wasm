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
  progressPercents: number[];
  firstProgressMs: number;
  progressJobMs: number;
}

for (const app of apps) {
  test(`${app.name}: runs qpdf in a worker with zero bundler config`, async ({ page, browserName }) => {
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
    // Not asserted for WebKit: on GitHub's Linux runners headless WebKit stalls requestAnimationFrame
    // for ~300-350 ms regardless of what the page does (CI 2026-10-06), while the worker spy above
    // already proves the job ran off the main thread in every browser.
    if (browserName !== "webkit" && r.jobMs > 300) {
      expect(r.maxFrameGapMs, `jobMs=${Math.round(r.jobMs)}`).toBeLessThan(250);
    }

    // Streaming progress (spec §3): 0 first, 100 last, strictly increasing, from a large encrypt.
    const percents = r.progressPercents;
    expect(percents[0]).toBe(0);
    expect(percents.at(-1)).toBe(100);
    expect(percents.every((p, i) => Number.isInteger(p) && (i === 0 || p > percents[i - 1]!))).toBe(true);
    expect(percents.length).toBeGreaterThanOrEqual(50);
    // Values arrived while the worker ran, not in one batch at the end. This relies on calls not being
    // throttled or batched (spec §3, guarantee 7). Only meaningful when the job was long enough to measure.
    if (r.progressJobMs > 300) {
      expect(r.firstProgressMs, `progressJobMs=${Math.round(r.progressJobMs)}`).toBeLessThan(r.progressJobMs * 0.75);
    }
  });
}
