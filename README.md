# FlatPPL Design Document

Design proposal for a lightweight probabilistic programming language.

## Published version

The latest rendered version is available on [GitHub Pages](https://democratizing-models.github.io/flatppl-design/).

## Locals builds

To generate both HTML and PDF versions of the document on your local system, run

```sh
pixi run build        # Build HTML and PDF into build/
pixi run build-html   # HTML only
pixi run build-pdf    # PDF only
pixi run clean        # Remove build output
```

The generated files are written to the `build/` directory.

Requires [Pixi](https://pixi.sh). All other dependencies (pandoc, typst) are installed automatically.
