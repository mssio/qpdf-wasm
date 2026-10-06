import type { JobSpec, MergeOptions } from "../types.js";
import { inputName, jobSpec, OUTPUT } from "./job.js";

export function mergeJob(inputs: Uint8Array[], options: MergeOptions = {}): JobSpec {
  if (inputs.length === 0) throw new RangeError("merge() needs at least one input");
  const files: Record<string, Uint8Array> = {};
  const pages = inputs.map((bytes, index) => {
    const file = inputName(index);
    files[file] = bytes;
    const password = options.password?.[index];
    return password === undefined ? { file } : { file, password };
  });
  return jobSpec({ empty: "", pages, outputFile: OUTPUT }, files);
}
