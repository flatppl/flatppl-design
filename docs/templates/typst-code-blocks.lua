-- Lua filter: convert highlighted code blocks to native Typst raw blocks
-- This replaces pandoc's Skylighting markup with Typst's native syntax highlighting

-- FlatPPL→host highlighting alias map, shared with html-anchors.lua via
-- flatppl-aliases.lua. Required relative to this filter since pandoc's
-- package.path omits the filter directory by default.
local script_dir = PANDOC_SCRIPT_FILE:match("^(.*[/\\])") or "./"
package.path = script_dir .. "?.lua;" .. package.path
local flatppl_alias = require("flatppl-aliases")

function CodeBlock(el)
  -- Preserve the language class for Typst's native highlighting
  local lang = ""
  if el.classes and #el.classes > 0 then
    lang = el.classes[1]
    -- FlatPPL has no dedicated highlighter; reuse Julia-flavored highlighting.
    lang = flatppl_alias[lang] or lang
    -- Sanitize lang to alphanumeric only (prevent injection via class names)
    lang = lang:gsub("[^%w]", "")
  end
  -- Escape any backtick sequences in code content that could close the code block
  local text = el.text:gsub("```", "`` `")
  if lang ~= "" then
    return pandoc.RawBlock("typst", "```" .. lang .. "\n" .. text .. "\n```")
  else
    return pandoc.RawBlock("typst", "```\n" .. text .. "\n```")
  end
end
