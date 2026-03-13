-- Lua filter: convert highlighted code blocks to native Typst raw blocks
-- This replaces pandoc's Skylighting markup with Typst's native syntax highlighting

function CodeBlock(el)
  -- Preserve the language class for Typst's native highlighting
  local lang = ""
  if el.classes and #el.classes > 0 then
    lang = el.classes[1]
    -- Use Python highlighting for FlatPPL code blocks
    if lang == "flatppl" then lang = "python" end
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
