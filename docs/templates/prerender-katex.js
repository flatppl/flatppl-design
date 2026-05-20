#!/usr/bin/env node
'use strict';
// Post-processes build/index.html: pre-renders all KaTeX math spans to static
// HTML and strips the client-side katex.min.js script, so math appears
// immediately on load with no JS overhead.
const fs = require('fs');
const path = require('path');

const htmlPath = path.join('build', 'index.html');
const katex = require(path.resolve(process.cwd(), 'build', 'katex', 'katex.min.js'));

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

let html = fs.readFileSync(htmlPath, 'utf8');
let rendered = 0;
let failed = 0;

// Pre-render inline math (tag and content may be split across lines by Pandoc)
html = html.replace(/<span\s+class="math inline">([\s\S]*?)<\/span>/g, function (match, raw) {
  try {
    rendered++;
    return katex.renderToString(decodeEntities(raw.trim()), { displayMode: false, throwOnError: true });
  } catch (e) {
    failed++;
    return match;
  }
});

// Pre-render display math
html = html.replace(/<span\s+class="math display">([\s\S]*?)<\/span>/g, function (match, raw) {
  try {
    rendered++;
    return katex.renderToString(decodeEntities(raw.trim()), { displayMode: true, throwOnError: true });
  } catch (e) {
    failed++;
    return match;
  }
});

// Strip the deferred katex.min.js loader
html = html.replace(/<script defer="" src="\.\/katex\/katex\.min\.js"><\/script>\s*/g, '');

// Strip the inline DOMContentLoaded render script (Pandoc-generated)
html = html.replace(/<script>document\.addEventListener\("DOMContentLoaded"[\s\S]*?<\/script>\s*/g, '');

fs.writeFileSync(htmlPath, html);
console.log('KaTeX pre-render: ' + rendered + ' expressions rendered, ' + failed + ' left for client fallback.');
