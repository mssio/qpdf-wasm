import { describe, expect, it } from "vitest";
import { classifyFailure, crashError, failureFromResult, parseWarnings, QpdfError, terminatedError } from "../../src/errors.js";

// Real stderr captured from qpdf 12.4.2 (spike, 2026-10-05).
const WRONG_PASSWORD = "qpdf: in.pdf: invalid password";
const NOT_A_PDF = [
  "WARNING: in.pdf: can't find PDF header",
  "WARNING: in.pdf: file is damaged",
  "WARNING: in.pdf: can't find startxref",
  "WARNING: in.pdf: Attempting to reconstruct cross-reference table",
  "qpdf: in.pdf: unable to find trailer dictionary while recovering damaged file",
].join("\n");
const WITH_WARNINGS = [
  "WARNING: in.pdf: file is damaged",
  "WARNING: in.pdf: can't find startxref",
  "qpdf: operation succeeded with warnings; resulting file may have some problems",
].join("\n");
const BAD_RANGE = "qpdf: parsing numeric range for in.pdf: error at * in numeric range *99: number 99 out of range";

describe("classifyFailure", () => {
  it("detects a wrong or missing password", () => {
    expect(classifyFailure(WRONG_PASSWORD)).toBe("INVALID_PASSWORD");
  });
  it("detects input that is not a PDF", () => {
    expect(classifyFailure(NOT_A_PDF)).toBe("INVALID_PDF");
  });
  it("detects a missing PDF header on its own", () => {
    expect(classifyFailure("WARNING: in.pdf: can't find PDF header")).toBe("INVALID_PDF");
  });
  it("detects an unrecoverable trailer on its own", () => {
    expect(classifyFailure("qpdf: in.pdf: unable to find trailer dictionary while recovering damaged file")).toBe("INVALID_PDF");
  });
  it("falls back to FAILED", () => {
    expect(classifyFailure(BAD_RANGE)).toBe("FAILED");
  });
});

describe("parseWarnings", () => {
  it("returns WARNING lines without the prefix", () => {
    expect(parseWarnings(WITH_WARNINGS)).toEqual(["in.pdf: file is damaged", "in.pdf: can't find startxref"]);
  });
  it("returns [] for empty stderr", () => {
    expect(parseWarnings("")).toEqual([]);
  });
});

describe("failureFromResult", () => {
  it("builds a QpdfError with the last non-warning line as message", () => {
    const err = failureFromResult({ exitCode: 2, stderr: BAD_RANGE });
    expect(err).toBeInstanceOf(QpdfError);
    expect(err.name).toBe("QpdfError");
    expect(err.code).toBe("FAILED");
    expect(err.exitCode).toBe(2);
    expect(err.stderr).toBe(BAD_RANGE);
    expect(err.message).toBe("parsing numeric range for in.pdf: error at * in numeric range *99: number 99 out of range");
  });
  it("classifies password failures", () => {
    expect(failureFromResult({ exitCode: 2, stderr: WRONG_PASSWORD }).code).toBe("INVALID_PASSWORD");
  });
  it("has a generic message when stderr is empty", () => {
    expect(failureFromResult({ exitCode: 2, stderr: "" }).message).toBe("qpdf failed with exit code 2");
  });
});

describe("terminatedError", () => {
  it("has code TERMINATED and no exit code", () => {
    const err = terminatedError();
    expect(err.code).toBe("TERMINATED");
    expect(err.exitCode).toBeNull();
  });
});

describe("crashError", () => {
  it("keeps QpdfErrors as they are", () => {
    const error = new QpdfError("INVALID_PDF", "bad");
    expect(crashError(error)).toBe(error);
  });
  it("wraps anything else as FAILED with a 'qpdf crashed' message", () => {
    const wrapped = crashError(new WebAssembly.RuntimeError("memory access out of bounds"));
    expect(wrapped).toBeInstanceOf(QpdfError);
    expect(wrapped.code).toBe("FAILED");
    expect(wrapped.message).toBe("qpdf crashed: memory access out of bounds");
    expect(crashError("boom").message).toBe("qpdf crashed: boom");
  });
});
