import { defineConfig } from "vite";

// Only fixture plumbing here (test PDFs). No qpdf-specific configuration.
export default defineConfig({
  publicDir: "../../../fixtures",
});
