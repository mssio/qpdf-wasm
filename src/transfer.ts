/** Unique ArrayBuffers behind the given views. A duplicate in a transfer list throws DataCloneError. */
export function transferablesOf(files: Record<string, Uint8Array>): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const bytes of Object.values(files)) {
    if (bytes.buffer instanceof ArrayBuffer) buffers.add(bytes.buffer);
  }
  return [...buffers];
}
