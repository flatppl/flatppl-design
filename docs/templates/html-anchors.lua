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

-- Phase 0b: extract abstract from body.
-- Looks for a Para whose text starts with "Abstract:" (with or without
-- bold/emphasis formatting) before the first Header.  Collects that
-- paragraph (and any following non-Header blocks before the next heading)
-- into meta.abstract, stripping the "Abstract:" label.  Only runs if
-- meta.abstract is not already set (YAML takes precedence).
local function abstract_from_body(doc)
  if doc.meta.abstract then return doc end

  for i, el in ipairs(doc.blocks) do
    -- Stop at first heading — abstract must come before any heading
    if el.tag == "Header" then return doc end

    if el.tag == "Para" then
      -- Extract plain text from the first few inlines to check for "Abstract:"
      -- We need to look inside Strong/Emph wrappers too
      local inlines = el.content
      local first_text = nil
      local label_end = nil  -- index after the "Abstract:" label

      for j = 1, #inlines do
        local node = inlines[j]
        local text = nil
        if node.tag == "Str" then
          text = node.text
        elseif node.tag == "Strong" or node.tag == "Emph" then
          -- Check first Str inside the wrapper
          for _, child in ipairs(node.content) do
            if child.tag == "Str" then
              text = child.text
              break
            end
          end
        end
        if text then
          if text:match("^[Aa]bstract[:.]$") then
            -- "Abstract:" or "Abstract." is a single token
            label_end = j + 1
            break
          elseif text:match("^[Aa]bstract[:.]") then
            -- "Abstract:..." or "Abstract...." merged with next word
            local rest = text:gsub("^[Aa]bstract[:.]", "")
            if node.tag == "Str" then
              inlines[j] = pandoc.Str(rest)
            end
            label_end = j
            break
          else
            -- First text token is not "Abstract:" — not an abstract para
            break
          end
        elseif node.tag == "Space" or node.tag == "SoftBreak" then
          -- Skip leading whitespace
        else
          break
        end
      end

      if label_end then
        -- Build abstract inlines: everything after the label
        local abs_inlines = pandoc.List()
        for j = label_end, #inlines do
          abs_inlines:insert(inlines[j])
        end
        -- Trim leading spaces
        while #abs_inlines > 0
            and (abs_inlines[1].tag == "Space"
              or abs_inlines[1].tag == "SoftBreak") do
          abs_inlines:remove(1)
        end

        -- Collect additional paragraphs until the next Header
        local abs_blocks = pandoc.List()
        if #abs_inlines > 0 then
          abs_blocks:insert(pandoc.Para(abs_inlines))
        end
        local remove_count = 1
        for j = i + 1, #doc.blocks do
          local blk = doc.blocks[j]
          -- Stop at headings
          if blk.tag == "Header" then break end
          -- Stop at bold paragraph titles (e.g. "**Scope and status.**")
          if blk.tag == "Para" and blk.content[1]
              and blk.content[1].tag == "Strong" then
            break
          end
          abs_blocks:insert(blk)
          remove_count = remove_count + 1
        end

        doc.meta.abstract = pandoc.MetaBlocks(abs_blocks)

        -- Remove the abstract blocks from the body
        for _ = 1, remove_count do
          doc.blocks:remove(i)
        end
        return doc
      end
    end
  end
  return doc
end

-- Combined Phase 0: title then abstract extraction
local function extract_metadata(doc)
  doc = title_from_h1(doc)
  doc = abstract_from_body(doc)
  return doc
end

-- Phase 3: add permalink anchor links to headings (HTML only).
local function heading_permalink(el)
  if FORMAT:match("html") and el.identifier ~= "" then
    local link = pandoc.RawInline("html",
      ' <a class="heading-anchor" href="#' .. el.identifier .. '">#</a>')
    el.content:insert(link)
  end
  return el
end

-- Phase 4: rewrite "flatppl" code-block class to "python" for syntax highlighting.
-- Only applies to HTML output; Markdown output keeps "flatppl" labels (useful for
-- AI chats), and Typst handles the alias via a show rule in typst-header.typ.
local function flatppl_to_python(el)
  if FORMAT:match("html") and el.classes[1] == "flatppl" then
    el.classes[1] = "python"
  end
  return el
end

-- Phase 5: sanitize raw HTML blocks and inlines.
-- Strip <script>, <iframe>, <object>, <embed>, <form>, <link>, <meta> tags
-- and on* event handler attributes to prevent code injection via malicious
-- pull requests. Allows safe structural HTML (<a id="...">, <br />, <h1>, <em>).
local dangerous_tags = {
  "script", "iframe", "object", "embed", "form", "link", "meta", "base",
  "applet", "style",
}

local function is_dangerous_html(text)
  local lower = text:lower()
  for _, tag in ipairs(dangerous_tags) do
    if lower:match("<" .. tag .. "[%s>]") or lower:match("<" .. tag .. "$")
        or lower:match("</" .. tag .. "%s*>") then
      return true
    end
  end
  -- Block on* event handlers (onclick, onerror, onload, etc.)
  if lower:match("%son%w+%s*=") then
    return true
  end
  -- Block javascript: URLs
  if lower:match("javascript%s*:") then
    return true
  end
  return false
end

local function sanitize_raw_block(el)
  if el.format == "html" and is_dangerous_html(el.text) then
    io.stderr:write("WARNING: stripped dangerous raw HTML block: "
      .. el.text:sub(1, 80) .. "\n")
    return pandoc.Null()
  end
  return el
end

local function sanitize_raw_inline(el)
  if el.format == "html" and is_dangerous_html(el.text) then
    io.stderr:write("WARNING: stripped dangerous raw HTML inline: "
      .. el.text:sub(1, 80) .. "\n")
    return pandoc.Str("")
  end
  return el
end

-- Phase 6: insert horizontal rules before top-level (##) sections.
-- When source files are split per-section, the separators between major
-- sections are injected here rather than stored in the source files.
local function inject_section_rules(doc)
  local out = pandoc.List()
  for _, el in ipairs(doc.blocks) do
    if el.tag == "Header" and el.level == 2 then
      out:insert(pandoc.HorizontalRule())
    end
    out:insert(el)
  end
  doc.blocks = out
  return doc
end

-- Return a filter list: sanitization first, then metadata extraction,
-- then headers, then inlines, then heading permalinks, then code-block
-- class rewriting, then section rule injection.
return {
  { RawBlock = sanitize_raw_block, RawInline = sanitize_raw_inline },
  { Pandoc = extract_metadata },
  { Header = header_filter },
  { Inlines = inlines_filter },
  { Header = heading_permalink },
  { CodeBlock = flatppl_to_python },
  { Pandoc = inject_section_rules },
}
