# FlatPPL Design Document

Design proposal for a lightweight probabilistic language.

## Published version

The latest rendered version is available at [spec.flatppl.org](https://spec.flatppl.org/).

## Locals builds

To render the document to various output formats on your local system, run

```sh
pixi run build        # Build all formats into build/
pixi run build-html   # HTML only
pixi run build-pdf    # PDF only
pixi run build-md     # Markdown with YAML frontmatter
pixi run build-typst  # Typst source
pixi run clean        # Remove build output
```

The generated files are written to the `build/` directory.

Requires [Pixi](https://pixi.sh). All other dependencies (pandoc, typst) are installed automatically.

## Funding

This work was supported by Germany's Federal Ministry of Research, Technology
and Space (BMFTR) within the ErUM-Data programme under grant FKZ 05D25PC1
(DEMOS consortium).
