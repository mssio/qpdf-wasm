import { afterEach, describe, expect, it, vi } from "vitest";
import { callSafely, createProgressFilter } from "../../src/progress.js";

const line = (percent: number) => `qpdf: out.pdf: write progress: ${percent}%`;

function feed(lines: string[]): { percents: number[]; consumed: boolean[] } {
  const percents: number[] = [];
  const filter = createProgressFilter((percent) => percents.push(percent));
  return { percents, consumed: lines.map(filter) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createProgressFilter", () => {
  it("reports progress lines and consumes them", () => {
    expect(feed([line(0), line(1), line(100)])).toEqual({ percents: [0, 1, 100], consumed: [true, true, true] });
  });
  it("passes every other line through", () => {
    expect(feed(["checking in.pdf", "WARNING: in.pdf: file is damaged", ""])).toEqual({
      percents: [],
      consumed: [false, false, false],
    });
  });
  it("drops repeated values but still consumes their lines", () => {
    const { percents, consumed } = feed([0, 2, 2, 3, 50, 50, 50, 51, 99, 99, 100].map(line));
    expect(percents).toEqual([0, 2, 3, 50, 51, 99, 100]);
    expect(consumed.every(Boolean)).toBe(true);
  });
  it("starts again at 0 for the next split output file, but not on a repeated 0", () => {
    expect(feed([0, 60, 100, 0, 100, 0, 0, 100].map(line)).percents).toEqual([0, 60, 100, 0, 100, 0, 100]);
  });
  it("continues a linearized split: a drop that does not reach 0 starts the next output file", () => {
    expect(feed([25, 50, 50, 100, 25, 50, 100].map(line)).percents).toEqual([25, 50, 100, 25, 50, 100]);
  });
  it("reads the stderr form qpdf uses when the PDF goes to stdout", () => {
    expect(feed(["qpdf: standard output: write progress: 7%"]).percents).toEqual([7]);
  });
});

describe("callSafely", () => {
  it("calls the callback with the percent", () => {
    const callback = vi.fn();
    callSafely(callback, 42);
    expect(callback).toHaveBeenCalledWith(42);
  });
  it("rethrows the callback's error asynchronously instead of throwing", () => {
    const boom = new Error("boom");
    const scheduled = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {});
    expect(() =>
      callSafely(() => {
        throw boom;
      }, 1),
    ).not.toThrow();
    const task = scheduled.mock.calls[0]?.[0];
    expect(task).toBeTypeOf("function");
    expect(() => task!()).toThrow(boom);
  });
});
