#!/usr/bin/env bash
# Fetch the canonical FlatPPL Kate grammar from flatppl-grammars into
# build/flatppl.xml (single source of truth). On network failure, fall back to
# the committed offline copy docs/templates/flatppl.xml. Pin a ref for
# reproducible builds via FLATPPL_GRAMMARS_REF (default: main).
set -euo pipefail
ref="${FLATPPL_GRAMMARS_REF:-main}"
url="https://raw.githubusercontent.com/flatppl/flatppl-grammars/${ref}/kate/flatppl.xml"
mkdir -p build
if curl -fsSL --retry 5 --retry-delay 2 --retry-connrefused --retry-all-errors "$url" -o build/flatppl.xml \
   && grep -q '<language name="FlatPPL"' build/flatppl.xml; then
  echo "fetched kate/flatppl.xml from flatppl-grammars@${ref} ($(wc -c < build/flatppl.xml) bytes)"
else
  echo "WARNING: grammar fetch failed; using committed offline copy docs/templates/flatppl.xml" >&2
  cp docs/templates/flatppl.xml build/flatppl.xml
fi
