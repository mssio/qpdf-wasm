# Changelog

All notable changes to `@mssio/qpdf-wasm`. Versions follow semver independently of qpdf;
each entry states the bundled qpdf version.

## 1.0.0 — 2026-10-06

- **Stable API.** From 1.0.0 this package follows semver for its public API; see README "Versioning".
- **Breaking:** requires Node ≥ 24 (`engines` raised from `>=20.16`). Browser usage is unchanged.
- No API changes since 0.1.0. Bundles qpdf 12.4.2 (unmodified), built with Emscripten 6.0.11. TypeScript users need TypeScript ≥ 5.7.
- Hardening: GitHub Actions pinned to commit SHAs, the Emscripten build image pinned by digest, releases only from `main`, npm registry signatures verified in CI, Dependabot for npm and Actions. Published through npm trusted publishing with provenance.

## 0.1.0 — 2026-10-06

- Initial release. Bundles qpdf 12.4.2 (unmodified), built with Emscripten 6.0.11. TypeScript users need TypeScript ≥ 5.7.
