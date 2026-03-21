-- Lua filter: convert highlighted code blocks to native Typst raw blocks
-- This replaces pandoc's Skylighting markup with Typst's native syntax highlighting

function CodeBlock(el)
  -- Preserve the language class for Typst's native highlighting
  local lang = ""
  if el.classes and #el.classes > 0 then
    lang = el.classes[1]
    -- Use Python highlighting for FlatPPL code blocks
    if lang == "flatppl" then lang = "python" end
  end
  if lang ~= "" then
    return pandoc.RawBlock("typst", "```" .. lang .. "\n" .. el.text .. "\n```")
  else
    return pandoc.RawBlock("typst", "```\n" .. el.text .. "\n```")
  end
end
