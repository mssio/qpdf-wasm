# qpdf patches

There are currently **no** patches: qpdf builds for WebAssembly unmodified.

Policy (see AGENTS.md): never edit `vendor/qpdf`. If a change to qpdf is truly unavoidable,
add `NNNN-short-description.patch` here (created with `git -C vendor/qpdf diff`), list it below
with the upstream issue/PR link, and prefer getting it fixed upstream. `build/build.sh` applies
patches to a copy of the source, never to the submodule.

| Patch | Why | Upstream link |
|---|---|---|
