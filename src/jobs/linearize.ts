import type { JobSpec, PasswordOptions } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword } from "./job.js";

export function linearizeJob(input: Uint8Array, options: PasswordOptions = {}): JobSpec {
  return jobSpec(withPassword({ inputFile: INPUT, linearize: "", outputFile: OUTPUT }, options.password), { [INPUT]: input });
}
