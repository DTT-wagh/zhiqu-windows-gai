const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'zhiqu-social-chat.js'), 'utf8');

assert.match(
  source,
  /\.zq-social-list-row \{[^}]*grid-template-columns: 40px minmax\(0, 1fr\) auto;/,
  'conversation rows must reserve separate avatar, content, and time columns',
);
assert.match(
  source,
  /\.zq-social-row-copy \{[^}]*display: grid;[^}]*min-width: 0;/,
  'conversation name and preview must stack instead of sharing one inline row',
);
assert.match(
  source,
  /\.zq-social-row-preview \{[^}]*display: block;[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/,
  'long previews must truncate before reaching the time column',
);
assert.match(
  source,
  /\.zq-social-row-meta \{[^}]*white-space: nowrap;/,
  'conversation timestamps must remain readable in their reserved column',
);

console.log('social chat conversation layout: ok');
