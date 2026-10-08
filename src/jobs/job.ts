import type { JobSpec, ProgressOptions } from "../types.js";

export const INPUT = "in.pdf";
export const OUTPUT = "out.pdf";
export const JOB_FILE = "job.json";

export function inputName(index: number): string {
  return `in-${index}.pdf`;
}

/** A JobSpec that runs qpdf with `job` (qpdf job JSON) and the given input files. */
export function jobSpec(job: Record<string, unknown>, files: Record<string, Uint8Array>): JobSpec {
  return {
    args: [`--job-json-file=${JOB_FILE}`],
    files: { ...files, [JOB_FILE]: new TextEncoder().encode(JSON.stringify(job)) },
  };
}

export function withPassword(job: Record<string, unknown>, password: string | undefined): Record<string, unknown> {
  return password === undefined ? job : { ...job, password };
}

/** Asks qpdf for write progress (job JSON `progress`) when the caller passed onProgress. */
export function withProgress(job: Record<string, unknown>, options: ProgressOptions): Record<string, unknown> {
  return options.onProgress === undefined ? job : { ...job, progress: "" };
}
