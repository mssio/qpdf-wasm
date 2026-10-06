/**
 * Where the worker script is expected, for error messages only (spawn() loads the real one, which a
 * bundler may have renamed). Deliberately not the literal `new URL("./worker.js", import.meta.url)`:
 * Vite would inline worker.js as a data: URL and webpack would emit it again as an asset.
 */
export function workerScriptUrlFor(base: string): string | undefined {
  // webpack replaces import.meta.url with the build machine's file: path, which the browser never loads.
  if (base.startsWith("file:")) return undefined;
  try {
    return new URL("./worker.js", base).href;
  } catch {
    // blob: and data: module URLs can't have relative URLs resolved against them.
    return undefined;
  }
}
