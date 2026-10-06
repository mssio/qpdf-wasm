import { describe, expect, it } from "vitest";
import { toBytes } from "../../src/input.js";

describe("toBytes", () => {
  it("returns a whole-buffer Uint8Array as is", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await toBytes(bytes)).toBe(bytes);
  });

  it("copies a view onto a larger buffer (only the viewed bytes, own buffer)", async () => {
    const big = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const view = big.subarray(2, 5);
    const out = await toBytes(view);
    expect([...out]).toEqual([1, 2, 3]);
    expect(out.buffer).not.toBe(big.buffer);
    expect(out.byteLength).toBe(out.buffer.byteLength);
  });

  it("copies a Node Buffer slice instead of sharing its pool", async () => {
    const pooled = Buffer.from("%PDF-1.4 tiny");
    const out = await toBytes(pooled);
    expect(new TextDecoder().decode(out)).toBe("%PDF-1.4 tiny");
    expect(out.byteLength).toBe(out.buffer.byteLength);
  });

  it("wraps an ArrayBuffer without copying", async () => {
    const buf = new Uint8Array([4, 5]).buffer;
    const out = await toBytes(buf);
    expect(out.buffer).toBe(buf);
  });

  it("reads a Blob", async () => {
    const out = await toBytes(new Blob([new Uint8Array([7, 8])]));
    expect([...out]).toEqual([7, 8]);
  });

  it("rejects a detached buffer with guidance", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] }); // detaches
    await expect(toBytes(bytes)).rejects.toThrow(TypeError);
    await expect(toBytes(bytes)).rejects.toThrow(/detached.*slice\(\)/);
  });

  it("rejects unsupported input types", async () => {
    await expect(toBytes("not bytes" as never)).rejects.toThrow(TypeError);
  });
});
