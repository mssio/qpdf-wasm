import { createQpdfApi } from "./api.js";
import { createInlineExecutor } from "./inline-executor.js";
import type { CreateQpdfOptions, Qpdf } from "./types.js";
import { loadWasmModule, resolveWasmUrl } from "./wasm-loader.js";

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

/** Loads qpdf.wasm and returns the API. Nothing is downloaded before this is called. */
export async function createQpdf(options: CreateQpdfOptions = {}): Promise<Qpdf> {
  const wasmUrl = resolveWasmUrl(options.wasmUrl);
  const inline = options.inline ?? typeof Worker === "undefined";
  if (!inline) throw new Error("worker mode is not implemented yet"); // replaced in Task 7
  return createQpdfApi(createInlineExecutor(await loadWasmModule(wasmUrl)));
}
