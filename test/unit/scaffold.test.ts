import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("repository scaffold", () => {
  it("pins qpdf as a submodule at a release", () => {
    const cmake = readFileSync(new URL("../../vendor/qpdf/CMakeLists.txt", import.meta.url), "utf8");
    expect(cmake).toMatch(/VERSION\s+\d+\.\d+\.\d+/);
  });

  it("pins an exact Emscripten version", () => {
    const pin = readFileSync(new URL("../../build/emsdk-version", import.meta.url), "utf8").trim();
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
