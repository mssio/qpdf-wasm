import type { JobSpec } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword } from "./job.js";

export function decryptJob(input: Uint8Array, options: { password: string }): JobSpec {
  return jobSpec(withPassword({ inputFile: INPUT, decrypt: "", outputFile: OUTPUT }, options.password), { [INPUT]: input });
}
