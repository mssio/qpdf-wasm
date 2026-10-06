import { createQpdfApi } from "./api.js";
import { createInlineExecutor } from "./inline-executor.js";
import type { CreateQpdfOptions, Qpdf } from "./types.js";
import { loadWasmModule, resolveWasmUrl } from "./wasm-loader.js";
import { createWorkerPool, type WorkerLike } from "./worker-pool.js";

export { QpdfError, type QpdfErrorCode } from "./errors.js";
export { qpdfVersion } from "./wasm/meta.mjs";
export type {
  CompressOptions,
  CreateQpdfOptions,
  EncryptOptions,
  MergeOptions,
  PasswordOptions,
  PdfInfo,
  PdfInput,
  Qpdf,
  QpdfResult,
  Rotation,
  RunOptions,
  RunResult,
  SplitOptions,
  SplitResult,
} from "./types.js";

/**
 * Loads qpdf.wasm and returns the API. Nothing is downloaded before this is called.
 * Browsers run jobs in module Web Workers; Node (no global Worker) runs them inline.
 */
export async function createQpdf(options: CreateQpdfOptions = {}): Promise<Qpdf> {
  const wasmUrl = resolveWasmUrl(options.wasmUrl);
  const size = options.workers ?? 1;
  if (!Number.isInteger(size) || size < 1) throw new RangeError("createQpdf() workers must be an integer >= 1");
  const inline = options.inline ?? typeof Worker === "undefined";
  if (inline) return createQpdfApi(createInlineExecutor(await loadWasmModule(wasmUrl)));

  const pool = await createWorkerPool({
    size,
    wasmUrl: wasmUrl.href,
    workerUrl: workerScriptUrl(),
    // Keep this expression literal: bundlers detect `new Worker(new URL(..., import.meta.url))`.
    spawn: () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as WorkerLike,
  });
  return createQpdfApi(pool);
}

/**
 * Where the worker script is expected, for error messages only (spawn() loads the real one, which a
 * bundler may have renamed). Deliberately not the literal `new URL("./worker.js", import.meta.url)`:
 * Vite would inline worker.js as a data: URL and webpack would emit it again as an asset.
 */
function workerScriptUrl(): string | undefined {
  const base = import.meta.url;
  // webpack replaces import.meta.url with the build machine's file: path, which the browser never loads.
  return base.startsWith("file:") ? undefined : new URL("./worker.js", base).href;
}
