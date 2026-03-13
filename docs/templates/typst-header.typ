// Allow tables (wrapped in figures by Pandoc) to break across pages.
#show figure.where(kind: table): set block(breakable: true)

// Style code blocks with light gray background.
#show raw.where(block: true): set block(
  fill: luma(245),
  inset: 8pt,
  radius: 4pt,
  width: 100%,
)
