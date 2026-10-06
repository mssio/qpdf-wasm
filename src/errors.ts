// The only module that matches qpdf's message text. Every pattern is covered by test/unit/errors.test.ts,
// so a wording change in a qpdf upgrade fails CI instead of silently degrading.

export type QpdfErrorCode = "INVALID_PASSWORD" | "INVALID_PDF" | "FAILED" | "TERMINATED";

export class QpdfError extends Error {
  readonly code: QpdfErrorCode;
  /** qpdf exit code, or null when qpdf did not run to completion. */
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(code: QpdfErrorCode, message: string, details: { exitCode?: number | null; stderr?: string } = {}) {
    super(message);
    this.name = "QpdfError";
    this.code = code;
    this.exitCode = details.exitCode ?? null;
    this.stderr = details.stderr ?? "";
  }
}

const INVALID_PASSWORD = /: invalid password$/m;
const INVALID_PDF = /can't find PDF header|unable to find trailer dictionary/;
const WARNING_PREFIX = "WARNING: ";

export function classifyFailure(stderr: string): QpdfErrorCode {
  if (INVALID_PASSWORD.test(stderr)) return "INVALID_PASSWORD";
  if (INVALID_PDF.test(stderr)) return "INVALID_PDF";
  return "FAILED";
}

export function parseWarnings(stderr: string): string[] {
  return stderr
    .split("\n")
    .filter((line) => line.startsWith(WARNING_PREFIX))
    .map((line) => line.slice(WARNING_PREFIX.length));
}

export function failureFromResult(result: { exitCode: number; stderr: string }): QpdfError {
  const lines = result.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith(WARNING_PREFIX));
  const last = lines.at(-1)?.replace(/^qpdf: /, "");
  return new QpdfError(classifyFailure(result.stderr), last ?? `qpdf failed with exit code ${result.exitCode}`, {
    exitCode: result.exitCode,
    stderr: result.stderr,
  });
}

export function terminatedError(): QpdfError {
  return new QpdfError("TERMINATED", "qpdf instance was terminated");
}
