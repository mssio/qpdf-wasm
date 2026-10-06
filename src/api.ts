import { failureFromResult, parseWarnings, QpdfError } from "./errors.js";
import { toBytes } from "./input.js";
import { compressJob } from "./jobs/compress.js";
import { decryptJob } from "./jobs/decrypt.js";
import { encryptJob } from "./jobs/encrypt.js";
import { infoJob, parseInfo } from "./jobs/info.js";
import { OUTPUT } from "./jobs/job.js";
import { linearizeJob } from "./jobs/linearize.js";
import { mergeJob } from "./jobs/merge.js";
import { rotateJob } from "./jobs/rotate.js";
import { selectPagesJob } from "./jobs/select-pages.js";
import { collectSplitOutputs, splitJob } from "./jobs/split.js";
import type { Executor, JobSpec, PdfInput, Qpdf, QpdfResult, RunResult } from "./types.js";

/** Typed helpers on top of an Executor. Exit 0 and 3 succeed; anything else rejects with QpdfError. */
export function createQpdfApi(executor: Executor): Qpdf {
  async function succeed(spec: JobSpec): Promise<{ result: RunResult; warnings: string[] }> {
    const result = await executor.exec(spec);
    if (result.exitCode !== 0 && result.exitCode !== 3) throw failureFromResult(result);
    return { result, warnings: parseWarnings(result.stderr) };
  }

  async function single(spec: JobSpec): Promise<QpdfResult> {
    const { result, warnings } = await succeed(spec);
    const output = result.files[OUTPUT];
    if (!output) {
      throw new QpdfError("FAILED", "qpdf reported success but wrote no output", {
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    }
    return { output, warnings };
  }

  return {
    merge: async (inputs, options) => single(mergeJob(await Promise.all(inputs.map(toBytes)), options)),
    split: async (input, options) => {
      const { result, warnings } = await succeed(splitJob(await toBytes(input), options));
      return { outputs: collectSplitOutputs(result.files), warnings };
    },
    selectPages: async (input, ranges, options) => single(selectPagesJob(await toBytes(input), ranges, options)),
    rotate: async (input, rotations, options) => single(rotateJob(await toBytes(input), rotations, options)),
    encrypt: async (input, options) => single(encryptJob(await toBytes(input), options)),
    decrypt: async (input, options) => single(decryptJob(await toBytes(input), options)),
    linearize: async (input, options) => single(linearizeJob(await toBytes(input), options)),
    compress: async (input, options) => single(compressJob(await toBytes(input), options)),
    info: async (input, options) => {
      const { result, warnings } = await succeed(infoJob(await toBytes(input), options));
      return { ...parseInfo(result.stdout), warnings };
    },
    run: async (args, options = {}) => {
      const entries = await Promise.all(
        Object.entries(options.files ?? {}).map(async ([name, data]: [string, PdfInput]) => [name, await toBytes(data)] as const),
      );
      return executor.exec({ args, files: Object.fromEntries(entries) });
    },
    terminate: () => executor.terminate(),
  };
}
