import type { DecryptOptions, JobSpec } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";

export function decryptJob(input: Uint8Array, options: DecryptOptions): JobSpec {
  const job = withPassword({ inputFile: INPUT, decrypt: "", outputFile: OUTPUT }, options.password);
  return jobSpec(withProgress(job, options), { [INPUT]: input });
}
