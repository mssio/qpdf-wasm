import { runJob } from "./engine.js";
import { crashError, QpdfError } from "./errors.js";
import type { FromWorker, ToWorker } from "./protocol.js";
import { transferablesOf } from "./transfer.js";
import { loadWasmModule } from "./wasm-loader.js";

export interface WorkerPort {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
}

/** Worker-side logic, separate from src/worker.ts so it can be tested without a real Worker. */
export function createWorkerHandler(port: WorkerPort): (message: ToWorker) => Promise<void> {
  let wasm: WebAssembly.Module | undefined;
  return async (message) => {
    if (message.type === "init") {
      try {
        wasm = await loadWasmModule(message.wasmUrl);
        port.postMessage({ type: "ready" });
      } catch (error) {
        port.postMessage({ type: "init-error", message: errorMessage(error) });
      }
      return;
    }
    try {
      if (!wasm) throw new QpdfError("FAILED", "qpdf worker received a job before init");
      const result = await runJob(wasm, message.spec);
      port.postMessage({ type: "result", id: message.id, result }, transferablesOf(result.files));
    } catch (error) {
      // Same wording as the inline executor; the pool turns this into QpdfError FAILED.
      port.postMessage({ type: "error", id: message.id, message: crashError(error).message });
    }
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
