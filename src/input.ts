import type { PdfInput } from "./types.js";

/**
 * Normalises an input to a Uint8Array that owns its whole ArrayBuffer, so it can be
 * transferred to a worker without detaching anything the caller didn't pass in.
 */
export async function toBytes(input: PdfInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    assertNotDetached(input.buffer);
    const ownsBuffer =
      input.buffer instanceof ArrayBuffer && input.byteOffset === 0 && input.byteLength === input.buffer.byteLength;
    return ownsBuffer ? input : new Uint8Array(input);
  }
  if (input instanceof ArrayBuffer) {
    assertNotDetached(input);
    return new Uint8Array(input);
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  throw new TypeError("Unsupported PDF input: expected Uint8Array, ArrayBuffer or Blob");
}

function assertNotDetached(buffer: ArrayBufferLike): void {
  if ((buffer as { detached?: boolean }).detached === true) {
    throw new TypeError(
      "PDF input buffer is detached: an earlier qpdf call transferred it to a worker. Pass bytes.slice() to keep a copy.",
    );
  }
}
