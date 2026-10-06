import type { EncryptOptions, JobSpec } from "../types.js";
import { INPUT, jobSpec, OUTPUT } from "./job.js";

export function encryptJob(input: Uint8Array, options: EncryptOptions): JobSpec {
  const bits = options.bits ?? 256;
  if (bits !== 256 && bits !== 128) throw new RangeError(`encrypt() bits must be 256 or 128, got ${bits}`);
  const allow = options.allow ?? {};
  const restrictions: Record<string, string> = bits === 128 ? { useAes: "y" } : {};
  if (allow.print !== undefined) restrictions.print = allow.print ? "full" : "none";
  if (allow.modify !== undefined) restrictions.modify = allow.modify ? "all" : "none";
  if (allow.extract !== undefined) restrictions.extract = allow.extract ? "y" : "n";
  if (allow.annotate !== undefined) restrictions.annotate = allow.annotate ? "y" : "n";
  const job = {
    inputFile: INPUT,
    encrypt: { userPassword: options.userPassword, ownerPassword: options.ownerPassword, [`${bits}bit`]: restrictions },
    outputFile: OUTPUT,
  };
  return jobSpec(job, { [INPUT]: input });
}
