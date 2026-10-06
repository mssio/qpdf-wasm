import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
export function readText(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}
export function workflowFiles(): string[] {
  return readdirSync(new URL(".github/workflows/", root))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => `.github/workflows/${f}`);
}
const pkg = JSON.parse(readText("package.json")) as {
  version: string;
  engines: { node: string };
  devDependencies: Record<string, string>;
};

describe("Node version alignment", () => {
  it("requires Node >= 24", () => {
    expect(pkg.engines.node).toBe(">=24");
  });

  it("pins .nvmrc to 24", () => {
    expect(readText(".nvmrc").trim()).toBe("24");
  });

  it("uses Node 24 in every setup-node step", () => {
    for (const file of workflowFiles()) {
      for (const match of readText(file).matchAll(/node-version:\s*(\S+)/g)) {
        expect(match[1], `${file}: ${match[0]}`).toBe("24");
      }
    }
  });

  it("uses @types/node for the same major as the runtime", () => {
    expect(pkg.devDependencies["@types/node"]).toMatch(/^\^24\./);
  });
});

describe("GitHub Actions pinning", () => {
  const PINNED = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/;

  it("pins every action to a full commit SHA with a version comment", () => {
    let count = 0;
    for (const file of workflowFiles()) {
      for (const match of readText(file).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)) {
        count++;
        const [line, ref = "", rest = ""] = match;
        expect(ref, `${file}: ${line.trim()} must be owner/repo@<40-hex sha>`).toMatch(PINNED);
        expect(rest, `${file}: ${line.trim()} needs a "# vX.Y.Z" comment`).toMatch(/#\s*v\d+(\.\d+){0,2}\b/);
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe("Emscripten image pin", () => {
  it("records the emsdk image digest", () => {
    expect(readText("build/emsdk-digest").trim()).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("runs the image by version and digest", () => {
    expect(readText("scripts/build-wasm.sh")).toContain('"emscripten/emsdk:${EMSDK_VERSION}@${EMSDK_DIGEST}"');
  });
});

describe("release metadata", () => {
  it("has the newest CHANGELOG heading equal to package.json's version", () => {
    const heading = readText("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+)\b/m);
    expect(heading?.[1]).toBe(pkg.version);
  });
});
