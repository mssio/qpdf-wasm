import { createQpdf, qpdfVersion } from "@mssio/qpdf-wasm";
import { imageHeavyPdf } from "./image-heavy-pdf.js";

const load = async (name) => new Uint8Array(await (await fetch(`/${name}`)).arrayBuffer());

/** Exercises the published package in a real browser: worker execution, transfers, errors. */
export async function smoke() {
  const qpdf = await createQpdf();
  try {
    // Main-thread responsiveness: track the largest gap between animation frames during a heavy job.
    let last = performance.now();
    let maxFrameGapMs = 0;
    let running = true;
    const tick = (now) => {
      maxFrameGapMs = Math.max(maxFrameGapMs, now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const form = await load("form.pdf");
    const started = performance.now();
    // The same buffer 40 times: the transfer list must be deduplicated.
    const repeated = await qpdf.merge(Array.from({ length: 40 }, () => form));
    const linearized = await qpdf.linearize(repeated.output);
    const jobMs = performance.now() - started;
    running = false;

    const merged = await qpdf.merge([await load("form.pdf"), await load("shared-form-images.pdf")]);
    const locked = await qpdf.encrypt(merged.output, { userPassword: "u", ownerPassword: "o" });
    const lockedInfo = await qpdf.info(locked.output.slice(), { password: "u" });
    const decrypted = await qpdf.decrypt(locked.output.slice(), { password: "u" });
    const wrongPasswordCode = await qpdf.decrypt(locked.output, { password: "x" }).then(
      () => "none",
      (error) => error.code,
    );
    // Streaming progress: a ~30 MB image-heavy PDF, where qpdf spends nearly the whole job writing.
    const big = imageHeavyPdf(60);
    const progress = [];
    const progressStarted = performance.now();
    await qpdf.encrypt(big, {
      userPassword: "u",
      ownerPassword: "o",
      onProgress: (percent) => progress.push({ percent, at: performance.now() - progressStarted }),
    });
    const progressJobMs = performance.now() - progressStarted;
    return {
      qpdfVersion,
      repeatedPages: (await qpdf.info(linearized.output)).pageCount,
      mergedPages: lockedInfo.pageCount,
      encrypted: lockedInfo.encrypted,
      decryptedPages: (await qpdf.info(decrypted.output)).pageCount,
      wrongPasswordCode,
      jobMs,
      maxFrameGapMs,
      progressPercents: progress.map((p) => p.percent),
      firstProgressMs: progress[0]?.at ?? -1,
      progressJobMs,
    };
  } finally {
    qpdf.terminate();
  }
}
