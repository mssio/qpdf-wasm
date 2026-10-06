import type { JobSpec, RunResult } from "./types.js";

export type ToWorker = { type: "init"; wasmUrl: string } | { type: "job"; id: number; spec: JobSpec };

export type FromWorker =
  | { type: "ready" }
  | { type: "init-error"; message: string }
  | { type: "result"; id: number; result: RunResult }
  | { type: "error"; id: number; message: string };
