/** Anything that holds PDF bytes. `Blob` includes `File` from `<input type="file">`. */
export type PdfInput = Uint8Array | ArrayBuffer | Blob;

export interface CreateQpdfOptions {
  /** Where to load qpdf.wasm from. Default: next to the package's own JS (bundlers handle this). */
  wasmUrl?: string | URL;
  /** Number of Web Workers. Default 1. */
  workers?: number;
  /** Run on the calling thread instead of a worker. Default: true where `Worker` is undefined (Node). */
  inline?: boolean;
}

export interface QpdfResult {
  /** Always backed by a plain ArrayBuffer, so it is a valid `BlobPart`. */
  output: Uint8Array<ArrayBuffer>;
  /** qpdf warnings (exit code 3). Empty when qpdf was silent. */
  warnings: string[];
}

export interface SplitResult {
  outputs: Uint8Array<ArrayBuffer>[];
  warnings: string[];
}

export interface PdfInfo {
  pdfVersion: string;
  pageCount: number;
  encrypted: boolean;
  warnings: string[];
}

export interface PasswordOptions {
  password?: string;
}

export interface ProgressOptions {
  /**
   * Called with qpdf's write progress, 0–100, while the job runs, on the calling thread. Values strictly increase
   * within one output file; `split()` starts again at 0 for each file. Never called before qpdf starts writing,
   * after the promise settles, or after `terminate()`. See README "Progress bar".
   */
  onProgress?: (percent: number) => void;
}

/** Options for `selectPages`, `rotate` and `linearize`. */
export interface OutputOptions extends PasswordOptions, ProgressOptions {}

export interface DecryptOptions extends ProgressOptions {
  password: string;
}

export interface MergeOptions extends ProgressOptions {
  /** Password per input, by index. */
  password?: (string | undefined)[];
}

export interface SplitOptions extends ProgressOptions {
  /** Pages per output file. Default 1. */
  pagesPerFile?: number;
  password?: string;
}

export interface CompressOptions extends ProgressOptions {
  password?: string;
  /** Flate level 1–9. Default 9. */
  level?: number;
}

export interface Rotation {
  /** Clockwise rotation added to the page's current rotation. */
  angle: 90 | 180 | 270 | -90;
  /** qpdf page range, e.g. "1-3,7,z". Default: all pages. */
  pages?: string;
}

export interface EncryptOptions extends ProgressOptions {
  userPassword: string;
  ownerPassword: string;
  /** AES-256 (default) or AES-128. */
  bits?: 256 | 128;
  /** Permissions. Anything not set to false stays allowed. */
  allow?: { print?: boolean; modify?: boolean; extract?: boolean; annotate?: boolean };
}

export interface RunOptions extends ProgressOptions {
  /** Files to place in qpdf's working directory before the run, by relative path. */
  files?: Record<string, PdfInput>;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Every file the run created in the working directory, by relative path. */
  files: Record<string, Uint8Array<ArrayBuffer>>;
}

export interface Qpdf {
  merge(inputs: PdfInput[], options?: MergeOptions): Promise<QpdfResult>;
  split(input: PdfInput, options?: SplitOptions): Promise<SplitResult>;
  selectPages(input: PdfInput, ranges: string, options?: OutputOptions): Promise<QpdfResult>;
  rotate(input: PdfInput, rotations: Rotation[], options?: OutputOptions): Promise<QpdfResult>;
  encrypt(input: PdfInput, options: EncryptOptions): Promise<QpdfResult>;
  decrypt(input: PdfInput, options: DecryptOptions): Promise<QpdfResult>;
  linearize(input: PdfInput, options?: OutputOptions): Promise<QpdfResult>;
  compress(input: PdfInput, options?: CompressOptions): Promise<QpdfResult>;
  info(input: PdfInput, options?: PasswordOptions): Promise<PdfInfo>;
  /** Raw qpdf CLI. Never rejects for qpdf exit codes; inspect `exitCode`. */
  run(args: string[], options?: RunOptions): Promise<RunResult>;
  /** Stops all workers; pending and later calls reject with TERMINATED. */
  terminate(): void;
}

/** Internal: one qpdf invocation. */
export interface JobSpec {
  args: string[];
  files: Record<string, Uint8Array>;
}

/** Internal: runs JobSpecs somewhere (calling thread or workers). */
export interface Executor {
  /** `onProgress` receives qpdf's write progress while the job runs (see src/progress.ts). */
  exec(spec: JobSpec, onProgress?: (percent: number) => void): Promise<RunResult>;
  terminate(): void;
}
