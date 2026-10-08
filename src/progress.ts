import { parseProgressLine } from "./errors.js";

/**
 * A line handler for qpdf's stdout/stderr: returns true when the line was a progress line (consumed).
 * Reports each percent once, rising. qpdf repeats values (encrypt, linearize) and starts again at 0
 * for each split output file.
 */
export function createProgressFilter(onPercent: (percent: number) => void): (line: string) => boolean {
  let last = -1;
  return (line) => {
    const percent = parseProgressLine(line);
    if (percent === null) return false;
    if (percent > last || (percent === 0 && last !== 0)) {
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
