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
pixi run check-theme  # Verify the pinned shared-theme manifest and hashes
pixi run clean        # Remove build output
```

The generated files are written to the `build/` directory.
The HTML build vendors the pinned `flatppl-theme` release from
`vendor/flatppl-theme/`; update it only as a complete release bundle.

Requires [Pixi](https://pixi.sh). All other dependencies (pandoc, typst) are installed automatically.

## Funding

This work was supported by Germany's Federal Ministry of Research, Technology
and Space (BMFTR) within the ErUM-Data programme under grant FKZ 05D25PC1
(DEMOS consortium).
