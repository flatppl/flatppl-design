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

-- Phase 0: extract title/subtitle from raw <h1> block.
-- Pandoc splits a multi-line <h1>...</h1> into three blocks:
--   RawBlock "<h1>", Plain [...inlines...], RawBlock "</h1>"
-- If the Plain contains a <br /> RawInline, text before it becomes the
-- title and text after it (stripped of <em>/<\/em>) becomes the subtitle.
-- All three blocks are removed so pandoc's template renders them via
-- metadata instead.
local function title_from_h1(doc)
  for i = 1, #doc.blocks - 2 do
    local b1 = doc.blocks[i]
    local b2 = doc.blocks[i + 1]
    local b3 = doc.blocks[i + 2]
    if b1.tag == "RawBlock" and b1.format == "html"
        and b1.text:match("^%s*<h1>%s*$")
        and b3.tag == "RawBlock" and b3.format == "html"
        and b3.text:match("^%s*</h1>%s*$")
        and b2.tag == "Plain" then
      -- Find the <br /> split point in the inlines
      local inlines = b2.content
      local br_pos = nil
      for j = 1, #inlines do
        if inlines[j].tag == "RawInline" and inlines[j].format == "html"
            and inlines[j].text:match("^<br%s*/?>$") then
          br_pos = j
          break
        end
      end
      if br_pos then
        -- Title: inlines before <br />
        local title_inlines = pandoc.List()
        for j = 1, br_pos - 1 do
          title_inlines:insert(inlines[j])
        end
        -- Subtitle: inlines after <br />, stripping <em>/<\/em> tags
        local sub_inlines = pandoc.List()
        for j = br_pos + 1, #inlines do
          local el = inlines[j]
          if el.tag == "RawInline" and el.format == "html"
              and (el.text:match("^<em>$") or el.text:match("^</em>$")) then
            -- skip <em> and </em> tags
          elseif el.tag == "SoftBreak" then
            -- skip line breaks between br and subtitle
          else
            sub_inlines:insert(el)
          end
        end
        -- Trim trailing spaces from title
        while #title_inlines > 0
            and title_inlines[#title_inlines].tag == "Space" do
          title_inlines:remove(#title_inlines)
        end
        -- Trim leading spaces from subtitle
        while #sub_inlines > 0
            and sub_inlines[1].tag == "Space" do
          sub_inlines:remove(1)
        end
        doc.meta.title = pandoc.MetaInlines(title_inlines)
        if #sub_inlines > 0 then
          doc.meta.subtitle = pandoc.MetaInlines(sub_inlines)
        end
        -- Remove the three blocks
        doc.blocks:remove(i + 2)
        doc.blocks:remove(i + 1)
        doc.blocks:remove(i)
        return doc
      end
    end
  end
  return doc
end

-- Return a filter list: title extraction first, then headers, then inlines.
return {
  { Pandoc = title_from_h1 },
  { Header = header_filter },
  { Inlines = inlines_filter },
}
