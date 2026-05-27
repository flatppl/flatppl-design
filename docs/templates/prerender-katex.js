#!/usr/bin/env node
'use strict';
// Post-processes build/index.html: pre-renders all KaTeX math spans to static
// HTML and strips the client-side katex.min.js script, so math appears
// immediately on load with no JS overhead.
const fs = require('fs');
const path = require('path');

const htmlPath = path.join('build', 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('KaTeX pre-render: ' + htmlPath + ' not found. Run pandoc first (pixi run _pandoc-html).');
  process.exit(1);
}
const katex = require(path.resolve(process.cwd(), 'build', 'katex', 'katex.min.js'));

function decodeEntities(str) {
  // &amp; must be decoded last; otherwise "&amp;lt;" (literal "&lt;") becomes "<".
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

let html = fs.readFileSync(htmlPath, 'utf8');
let rendered = 0;
let failed = 0;

function renderMath(displayMode) {
  return function (match, raw) {
    const source = decodeEntities(raw.trim());
    try {
      const out = katex.renderToString(source, { displayMode: displayMode, throwOnError: true });
      rendered++;
      return out;
    } catch (e) {
      failed++;
      console.warn('KaTeX pre-render failed (' + (displayMode ? 'display' : 'inline') + '): ' + source + ' — ' + e.message);
      return match;
    }
  };
}

// Pre-render inline math (tag and content may be split across lines by Pandoc).
// Class attribute matched loosely so additional Pandoc classes don't break the regex.
html = html.replace(/<span\s+class="[^"]*\bmath\s+inline\b[^"]*">([\s\S]*?)<\/span>/g, renderMath(false));

// Pre-render display math
html = html.replace(/<span\s+class="[^"]*\bmath\s+display\b[^"]*">([\s\S]*?)<\/span>/g, renderMath(true));

// Strip the deferred katex.min.js loader.
// Pandoc may emit defer with or without an attribute value depending on version.
html = html.replace(/<script\s+(?:defer(?:="[^"]*")?\s+)?src="\.\/katex\/katex\.min\.js"(?:\s+defer(?:="[^"]*")?)?\s*><\/script>\s*/g, '');

// Strip the inline DOMContentLoaded render script (Pandoc-generated, validated against pandoc >=3.9,<4).
// If pandoc is bumped and this pattern stops matching, the client-side KaTeX loader will remain
// in the output (duplicate rendering) rather than silently breaking math.
html = html.replace(/<script>document\.addEventListener\("DOMContentLoaded"[\s\S]*?<\/script>\s*/g, '');

fs.writeFileSync(htmlPath, html);
console.log('KaTeX pre-render: ' + rendered + ' expressions rendered, ' + failed + ' failed.');
if (failed > 0) {
  // Client-side fallback is stripped above, so failed expressions are broken in the output.
  console.error('KaTeX pre-render: ' + failed + ' expression(s) failed and have no client-side fallback. Failing build.');
  process.exit(1);
}
