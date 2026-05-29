-- Shared FlatPPL→host-language highlighting aliases.
-- FlatPPL has no dedicated syntax highlighter, so it reuses Julia-flavored
-- highlighting. Required by html-anchors.lua (HTML) and typst-code-blocks.lua
-- (Typst) so the alias lives in exactly one place.
return {
  flatppl = "julia",
}
