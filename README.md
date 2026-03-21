# FlatPPL Design Document

Design proposal for a lightweight probabilistic language.

## Published version

The latest rendered version is available on [GitHub Pages](https://democratizing-models.github.io/flatppl-design/).

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
