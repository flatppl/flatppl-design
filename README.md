# FlatPPL Design Document

Design proposal for a lightweight probabilistic language.

## Websites

- [flatppl.org](https://flatppl.org/): project homepage, served from
  [flatppl/flatppl.github.io](https://github.com/flatppl/flatppl.github.io);
  `www.flatppl.org` redirects there.
- [spec.flatppl.org](https://spec.flatppl.org/): the latest rendered version of
  this document, served from this repository.
- [live.flatppl.org](https://live.flatppl.org/): the playground, served from
  [flatppl/flatppl-js](https://github.com/flatppl/flatppl-js).

All three are GitHub Pages sites under the `flatppl.org` domain.

## Locals builds

To render the document to various output formats on your local system, run

```sh
pixi run build        # Build all formats into build/
pixi run build-html   # HTML only
pixi run build-pdf    # PDF only
pixi run build-md     # Markdown with YAML frontmatter
pixi run build-typst  # Typst source
pixi run test-js      # Browser-side JavaScript checks
pixi run check-theme  # Fetch the shared theme and check it against its manifest
pixi run clean        # Remove build output
```

The generated files are written to the `build/` directory.

The HTML build needs the shared
[`flatppl-theme`](https://github.com/flatppl/flatppl-theme) bundle, which is not
committed here: `docs/templates/fetch-theme.js` puts it into
`vendor/flatppl-theme/` on every build. A sibling checkout wins —
`FLATPPL_THEME_DIR`, otherwise `../flatppl-theme` when it exists — and is copied
in unverified; an edit in that checkout reaches the site on the next build,
since nothing watches it. Without one, the pinned release tarball is downloaded
(tag `FLATPPL_THEME_REF`, default `v0.1.8`) and checked against its own
`manifest.json`. `FLATPPL_THEME_NO_SIBLING=1` ignores a sibling checkout, which
is how to exercise the release path locally.

Requires [Pixi](https://pixi.sh). All other dependencies (pandoc, typst) are installed automatically.

## Funding

This work was supported by Germany's Federal Ministry of Research, Technology
and Space (BMFTR) within the ErUM-Data programme under grant FKZ 05D25PC1
(DEMOS consortium).
