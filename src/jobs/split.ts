import type { JobSpec, SplitOptions } from "../types.js";
import { INPUT, jobSpec, withPassword } from "./job.js";

const SPLIT_OUTPUT = /^out-(\d+)(?:-\d+)?\.pdf$/;

export function splitJob(input: Uint8Array, options: SplitOptions = {}): JobSpec {
  const pagesPerFile = options.pagesPerFile ?? 1;
  if (!Number.isInteger(pagesPerFile) || pagesPerFile < 1) {
    throw new RangeError("split() pagesPerFile must be an integer >= 1");
  }
  const job = { inputFile: INPUT, splitPages: String(pagesPerFile), outputFile: "out-%d.pdf" };
  return jobSpec(withPassword(job, options.password), { [INPUT]: input });
}

/** qpdf names split outputs out-N.pdf or out-N-M.pdf; return them in page order. */
export function collectSplitOutputs(files: Record<string, Uint8Array>): Uint8Array[] {
  return Object.entries(files)
    .flatMap(([name, bytes]) => {
      const match = SPLIT_OUTPUT.exec(name);
      return match ? [{ first: Number(match[1]), bytes }] : [];
    })
    .sort((a, b) => a.first - b.first)
    .map((entry) => entry.bytes);
}
