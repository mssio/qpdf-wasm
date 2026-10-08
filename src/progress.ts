import { parseProgressLine } from "./errors.js";

/**
 * A line handler for qpdf's stdout/stderr: returns true when the line was a progress line (consumed).
 * Reports `p` whenever `p !== last`. Within one output file qpdf's values never decrease, so a rise
 * continues the file and a drop starts the next split output file (a linearized one starts above 0).
 * qpdf repeats values (encrypt, linearize); repeats are consumed silently.
 */
export function createProgressFilter(onPercent: (percent: number) => void): (line: string) => boolean {
  let last = -1;
  return (line) => {
    const percent = parseProgressLine(line);
    if (percent === null) return false;
    if (percent !== last) {
      last = percent;
      onPercent(percent);
    }
    return true;
  };
}

/** Calls the caller's callback. A throw is rethrown asynchronously, so it can't abort qpdf or break the pool. */
export function callSafely(callback: (percent: number) => void, percent: number): void {
  try {
    callback(percent);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}
