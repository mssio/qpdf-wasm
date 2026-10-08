import type { JobSpec, OutputOptions } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";

export function linearizeJob(input: Uint8Array, options: OutputOptions = {}): JobSpec {
  const job = withPassword({ inputFile: INPUT, linearize: "", outputFile: OUTPUT }, options.password);
  return jobSpec(withProgress(job, options), { [INPUT]: input });
}
