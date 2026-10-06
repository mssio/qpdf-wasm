import type { CompressOptions, JobSpec } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword } from "./job.js";

export function compressJob(input: Uint8Array, options: CompressOptions = {}): JobSpec {
  const level = options.level ?? 9;
  if (!Number.isInteger(level) || level < 1 || level > 9) throw new RangeError("compress() level must be an integer 1-9");
  const job = {
    inputFile: INPUT,
    objectStreams: "generate",
    recompressFlate: "",
    compressionLevel: String(level),
    outputFile: OUTPUT,
  };
  return jobSpec(withPassword(job, options.password), { [INPUT]: input });
}
