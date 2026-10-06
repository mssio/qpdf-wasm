import { expect, test } from "@playwright/test";

const apps = [
  { name: "vite build", url: "http://localhost:4301/" },
  { name: "webpack 5", url: "http://localhost:4302/" },
  { name: "vite dev", url: "http://localhost:4303/" },
];

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
    await page.goto(app.url);
    await page.waitForFunction(() => typeof (window as unknown as { qpdfSmoke?: unknown }).qpdfSmoke === "function");
    const r = await page.evaluate(() => (window as unknown as { qpdfSmoke: () => Promise<SmokeResult> }).qpdfSmoke());

    expect(errors).toEqual([]);
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
