import type { JobSpec, OutputOptions } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";

export function selectPagesJob(input: Uint8Array, ranges: string, options: OutputOptions = {}): JobSpec {
  if (ranges.trim() === "") throw new RangeError("selectPages() needs a page range such as \"1-3,7\"");
  const job = { inputFile: INPUT, pages: [{ file: ".", range: ranges }], outputFile: OUTPUT };
  return jobSpec(withProgress(withPassword(job, options.password), options), { [INPUT]: input });
}
