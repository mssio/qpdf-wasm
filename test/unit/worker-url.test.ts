import { describe, expect, it } from "vitest";
import { workerScriptUrlFor } from "../../src/worker-url.js";

describe("workerScriptUrlFor", () => {
  it("resolves worker.js next to an http(s) module", () => {
    expect(workerScriptUrlFor("https://cdn.example.com/qpdf/dist/index.js")).toBe(
      "https://cdn.example.com/qpdf/dist/worker.js",
    );
  });

  it("returns undefined for webpack's build-time file: URL", () => {
    expect(workerScriptUrlFor("file:///build/node_modules/@mssio/qpdf-wasm/dist/index.js")).toBeUndefined();
  });

  it("returns undefined instead of throwing for blob: and data: module URLs", () => {
    expect(workerScriptUrlFor("blob:https://app.example.com/2f1c7a9e-0d5b-4c1e-9a7f-3b8d2e6f4a10")).toBeUndefined();
    expect(workerScriptUrlFor("data:text/javascript,export%20{}")).toBeUndefined();
  });
});
