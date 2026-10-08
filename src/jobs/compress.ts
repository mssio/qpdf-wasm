import type { CompressOptions, JobSpec } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";

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
  return jobSpec(withProgress(withPassword(job, options.password), options), { [INPUT]: input });
}
