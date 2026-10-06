import { runJob } from "./engine.js";
import { terminatedError } from "./errors.js";
import type { Executor } from "./types.js";

/** Runs jobs on the calling thread. Used in Node and with `inline: true`. */
export function createInlineExecutor(wasm: WebAssembly.Module): Executor {
  let terminated = false;
  return {
    async exec(spec) {
      if (terminated) throw terminatedError();
      return runJob(wasm, spec);
    },
    terminate() {
      terminated = true;
    },
  };
}
