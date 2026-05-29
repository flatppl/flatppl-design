-- Lua filter: strip filename prefixes from cross-file markdown links
-- Converts links like [text](05-syntax.md#anchor) to [text](#anchor)
-- Also verifies that referenced files exist in the source directory.
-- Used after concatenating split source files into a single document.

local source_dir = os.getenv("FLATPPL_DOCS_DIR") or "docs/"

function Link(el)
  -- Match both anchored (05-syntax.md#sec) and bare (11-flatpir.md) cross-file
  -- links so that a reference to a non-existent file is caught in either form.
  -- Two anchored matches keep the boundary strict: a trailing fragment must be
  -- a real "#anchor", so e.g. "05-foo.markdown" is not mis-parsed as a .md ref.
  local filename, anchor = el.target:match("^(%d%d%-[%w%-]+%.md)(#.*)$")
  if not filename then
    filename = el.target:match("^(%d%d%-[%w%-]+%.md)$")
    anchor = ""
  end
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
    -- Strip the filename prefix only when an anchor is present; rewriting a
    -- bare-file link to "" would produce an empty (dead) link target.
    if anchor ~= "" then
      el.target = anchor
    end
  end
  return el
end
