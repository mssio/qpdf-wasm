import { describe, expect, it } from "vitest";
import { compressJob } from "../../src/jobs/compress.js";
import { decryptJob } from "../../src/jobs/decrypt.js";
import { encryptJob } from "../../src/jobs/encrypt.js";
import { infoJob, parseInfo } from "../../src/jobs/info.js";
import { JOB_FILE } from "../../src/jobs/job.js";
import { linearizeJob } from "../../src/jobs/linearize.js";
import { mergeJob } from "../../src/jobs/merge.js";
import { rotateJob } from "../../src/jobs/rotate.js";
import { selectPagesJob } from "../../src/jobs/select-pages.js";
import { collectSplitOutputs, splitJob } from "../../src/jobs/split.js";
import type { JobSpec, ProgressOptions } from "../../src/types.js";

const A = new Uint8Array([1]);
const B = new Uint8Array([2]);
const jobOf = (spec: JobSpec) => JSON.parse(new TextDecoder().decode(spec.files[JOB_FILE]));

describe("every builder", () => {
  it("runs qpdf with the job file", () => {
    expect(linearizeJob(A).args).toEqual(["--job-json-file=job.json"]);
  });
});

describe("mergeJob", () => {
  it("merges inputs in order into an empty document", () => {
    const spec = mergeJob([A, B]);
    expect(spec.files["in-0.pdf"]).toBe(A);
    expect(spec.files["in-1.pdf"]).toBe(B);
    expect(jobOf(spec)).toEqual({ empty: "", pages: [{ file: "in-0.pdf" }, { file: "in-1.pdf" }], outputFile: "out.pdf" });
  });
  it("passes per-input passwords", () => {
    expect(jobOf(mergeJob([A, B], { password: [undefined, "pw"] })).pages).toEqual([
      { file: "in-0.pdf" },
      { file: "in-1.pdf", password: "pw" },
    ]);
  });
  it("rejects an empty list", () => {
    expect(() => mergeJob([])).toThrow(RangeError);
  });
});

describe("splitJob", () => {
  it("splits one page per file by default", () => {
    expect(jobOf(splitJob(A))).toEqual({ inputFile: "in.pdf", splitPages: "1", outputFile: "out-%d.pdf" });
  });
  it("supports pagesPerFile and password", () => {
    expect(jobOf(splitJob(A, { pagesPerFile: 2, password: "pw" }))).toEqual({
      inputFile: "in.pdf",
      splitPages: "2",
      outputFile: "out-%d.pdf",
      password: "pw",
    });
  });
  it("rejects pagesPerFile < 1 or non-integers", () => {
    expect(() => splitJob(A, { pagesPerFile: 0 })).toThrow(RangeError);
    expect(() => splitJob(A, { pagesPerFile: 1.5 })).toThrow(RangeError);
  });
});

describe("collectSplitOutputs", () => {
  it("orders outputs by first page number, numerically", () => {
    const f = (n: number) => new Uint8Array([n]);
    const files = { "out-10.pdf": f(10), "out-2.pdf": f(2), "out-1.pdf": f(1), "out-9.pdf": f(9) };
    expect(collectSplitOutputs(files).map((b) => b[0])).toEqual([1, 2, 9, 10]);
  });
  it("handles range names and ignores unrelated files", () => {
    const f = (n: number) => new Uint8Array([n]);
    const files = { "out-3-4.pdf": f(3), "out-1-2.pdf": f(1), "job.json": f(0), "out-11-12.pdf": f(11) };
    expect(collectSplitOutputs(files).map((b) => b[0])).toEqual([1, 3, 11]);
  });
});

describe("selectPagesJob", () => {
  it("selects ranges from the input itself", () => {
    expect(jobOf(selectPagesJob(A, "1,3-z"))).toEqual({
      inputFile: "in.pdf",
      pages: [{ file: ".", range: "1,3-z" }],
      outputFile: "out.pdf",
    });
  });
  it("rejects an empty range", () => {
    expect(() => selectPagesJob(A, " ")).toThrow(RangeError);
  });
});

describe("rotateJob", () => {
  it("adds relative rotations, defaulting to all pages", () => {
    expect(jobOf(rotateJob(A, [{ angle: 90, pages: "1" }, { angle: -90 }, { angle: 180, pages: "2-z" }])).rotate).toEqual([
      "+90:1",
      "-90:1-z",
      "+180:2-z",
    ]);
  });
  it("rejects unsupported angles and empty lists", () => {
    expect(() => rotateJob(A, [{ angle: 45 as never }])).toThrow(RangeError);
    expect(() => rotateJob(A, [])).toThrow(RangeError);
  });
});

describe("encryptJob", () => {
  it("defaults to AES-256 with everything allowed", () => {
    expect(jobOf(encryptJob(A, { userPassword: "u", ownerPassword: "o" }))).toEqual({
      inputFile: "in.pdf",
      encrypt: { userPassword: "u", ownerPassword: "o", "256bit": {} },
      outputFile: "out.pdf",
    });
  });
  it("maps restrictions", () => {
    const job = jobOf(
      encryptJob(A, { userPassword: "u", ownerPassword: "o", allow: { print: false, modify: false, extract: false, annotate: false } }),
    );
    expect(job.encrypt["256bit"]).toEqual({ print: "none", modify: "none", extract: "n", annotate: "n" });
  });
  it("uses AES for 128-bit", () => {
    const job = jobOf(encryptJob(A, { userPassword: "u", ownerPassword: "o", bits: 128, allow: { print: true } }));
    expect(job.encrypt["128bit"]).toEqual({ useAes: "y", print: "full" });
  });
  it("rejects other key sizes", () => {
    expect(() => encryptJob(A, { userPassword: "u", ownerPassword: "o", bits: 40 as never })).toThrow(RangeError);
  });
});

describe("decryptJob", () => {
  it("decrypts with the password", () => {
    expect(jobOf(decryptJob(A, { password: "pw" }))).toEqual({
      inputFile: "in.pdf",
      decrypt: "",
      outputFile: "out.pdf",
      password: "pw",
    });
  });
});

describe("linearizeJob / compressJob", () => {
  it("linearizes", () => {
    expect(jobOf(linearizeJob(A))).toEqual({ inputFile: "in.pdf", linearize: "", outputFile: "out.pdf" });
  });
  it("compresses with object streams and level 9 by default", () => {
    expect(jobOf(compressJob(A))).toEqual({
      inputFile: "in.pdf",
      objectStreams: "generate",
      recompressFlate: "",
      compressionLevel: "9",
      outputFile: "out.pdf",
    });
  });
  it("rejects compression levels outside 1-9", () => {
    expect(() => compressJob(A, { level: 0 })).toThrow(RangeError);
    expect(() => compressJob(A, { level: 10 })).toThrow(RangeError);
  });
});

describe("infoJob / parseInfo", () => {
  it("asks for the qpdf, pages and encrypt keys of JSON v2, trailer only", () => {
    expect(jobOf(infoJob(A, { password: "pw" }))).toEqual({
      inputFile: "in.pdf",
      json: "2",
      jsonKey: ["qpdf", "pages", "encrypt"],
      jsonObject: ["trailer"],
      password: "pw",
    });
  });
  it("extracts version, page count and encryption", () => {
    const stdout = JSON.stringify({
      version: 2,
      pages: [{}, {}, {}],
      encrypt: { encrypted: true },
      qpdf: [{ jsonversion: 2, pdfversion: "1.7" }, { trailer: {} }],
    });
    expect(parseInfo(stdout)).toEqual({ pdfVersion: "1.7", pageCount: 3, encrypted: true });
  });
});

describe("progress in every writing builder", () => {
  const onProgress = () => {};
  const builders: Record<string, (options: ProgressOptions) => JobSpec> = {
    merge: (options) => mergeJob([A, B], options),
    split: (options) => splitJob(A, options),
    selectPages: (options) => selectPagesJob(A, "1", options),
    rotate: (options) => rotateJob(A, [{ angle: 90 }], options),
    encrypt: (options) => encryptJob(A, { userPassword: "u", ownerPassword: "o", ...options }),
    decrypt: (options) => decryptJob(A, { password: "pw", ...options }),
    linearize: (options) => linearizeJob(A, options),
    compress: (options) => compressJob(A, options),
  };
  for (const [name, build] of Object.entries(builders)) {
    it(`${name}: asks qpdf for progress only when onProgress is set`, () => {
      expect(jobOf(build({ onProgress }))).toHaveProperty("progress", "");
      expect(jobOf(build({}))).not.toHaveProperty("progress");
      expect(jobOf(build({ onProgress: undefined }))).not.toHaveProperty("progress");
    });
  }
  it("keeps the password next to progress", () => {
    expect(jobOf(linearizeJob(A, { password: "pw", onProgress }))).toEqual({
      inputFile: "in.pdf",
      linearize: "",
      outputFile: "out.pdf",
      password: "pw",
      progress: "",
    });
  });
  it("info never asks for progress", () => {
    expect(jobOf(infoJob(A))).not.toHaveProperty("progress");
  });
});
