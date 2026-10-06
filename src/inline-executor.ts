import { runJob } from "./engine.js";
import { crashError, terminatedError } from "./errors.js";
import type { Executor } from "./types.js";

/** Runs jobs on the calling thread. Used in Node and with `inline: true`. */
export function createInlineExecutor(wasm: WebAssembly.Module): Executor {
  let terminated = false;
  return {
    async exec(spec) {
      if (terminated) throw terminatedError();
      try {
        return await runJob(wasm, spec);
      } catch (error) {
        throw crashError(error);
      }
    },
    terminate() {
      terminated = true;
    },
  };
}
