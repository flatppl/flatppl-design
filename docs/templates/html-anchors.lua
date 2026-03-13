-- Pandoc Lua filter: convert <a id="..."></a> raw HTML anchors to native
-- Pandoc identifiers.  This makes them visible to all output backends
-- (Typst, LaTeX, …) while the source Markdown stays GitHub/preview-compatible.
--
-- Pandoc splits `<a id="foo"></a>` into two RawInline nodes: the opening
-- tag and the closing tag.
--
-- For Headers we replace the heading's own identifier with the anchor id
-- so Typst generates a proper label on the heading and the outline works.
-- For non-header contexts (e.g. bibliography) we replace the pair with
-- an empty Span carrying the id.
--
-- We use a filter list to ensure Header runs before Inlines.

-- Helper: find a <a id="..."></a> pair in an Inlines list, remove it,
-- and return the extracted id (or nil).
local function extract_anchor_id(inlines)
  for i = 1, #inlines - 1 do
    local el = inlines[i]
    if el.tag == "RawInline" and el.format == "html" then
      local id = el.text:match('^<a%s+id="([^"]+)"%s*>$')
      if id
          and inlines[i + 1].tag == "RawInline"
          and inlines[i + 1].format == "html"
          and inlines[i + 1].text:match('^</a>$') then
        inlines:remove(i + 1)
        inlines:remove(i)
        return id
      end
    end
  end
  return nil
end

-- Phase 1: process headers — hoist anchor id onto the Header element.
local function header_filter(el)
  local id = extract_anchor_id(el.content)
  if id then
    el.identifier = id
  end
  return el
end

-- Phase 2: process remaining inlines — replace anchor pairs with Spans.
local function inlines_filter(inlines)
  local out = pandoc.List()
  local i = 1
  while i <= #inlines do
    local el = inlines[i]
    if el.tag == "RawInline" and el.format == "html" then
      local id = el.text:match('^<a%s+id="([^"]+)"%s*>$')
      if id and inlines[i + 1]
          and inlines[i + 1].tag == "RawInline"
          and inlines[i + 1].format == "html"
          and inlines[i + 1].text:match('^</a>$') then
        out:insert(pandoc.Span({}, pandoc.Attr(id)))
        i = i + 2
      else
        out:insert(el)
        i = i + 1
      end
    else
      out:insert(el)
      i = i + 1
    end
  end
  return out
end

-- Return a filter list: headers first, then remaining inlines.
return {
  { Header = header_filter },
  { Inlines = inlines_filter },
}
