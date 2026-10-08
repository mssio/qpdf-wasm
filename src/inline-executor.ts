import { runJob } from "./engine.js";
import { crashError, terminatedError } from "./errors.js";
import { callSafely } from "./progress.js";
import type { Executor } from "./types.js";

/** Runs jobs on the calling thread. Used in Node and with `inline: true`. */
export function createInlineExecutor(wasm: WebAssembly.Module): Executor {
  let terminated = false;
  return {
    async exec(spec, onProgress) {
      if (terminated) throw terminatedError();
      let settled = false;
      // Never after this job settles or after terminate(); a throwing callback must not abort qpdf.
      const report =
        onProgress &&
        ((percent: number) => {
          if (!settled && !terminated) callSafely(onProgress, percent);
        });
      try {
        return await runJob(wasm, spec, report);
      } catch (error) {
        throw crashError(error);
      } finally {
        settled = true;
      }
    },
    terminate() {
      terminated = true;
    },
  };
}
