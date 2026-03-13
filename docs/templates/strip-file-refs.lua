-- Lua filter: strip filename prefixes from cross-file markdown links
-- Converts links like [text](05-syntax.md#anchor) to [text](#anchor)
-- Also verifies that referenced files exist in the source directory.
-- Used after concatenating split source files into a single document.

local source_dir = "docs/"

function Link(el)
  local filename = el.target:match("^(%d%d%-[%w%-]+%.md)#")
  if filename then
    local path = source_dir .. filename
    local f = io.open(path, "r")
    if f then
      f:close()
    else
      io.stderr:write("ERROR: cross-reference to non-existent file '" .. filename
        .. "' in link [" .. pandoc.utils.stringify(el.content) .. "]("
        .. el.target .. ")\n")
      os.exit(1)
    end
    el.target = el.target:gsub("^%d%d%-[%w%-]+%.md(#.+)$", "%1")
  end
  return el
end
