const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'zhiqu-social-chat.js'), 'utf8');

assert.match(
  source,
  /\.zq-social-backdrop-enter \.zq-social-panel \{[^}]*animation: zq-social-message-pop 280ms cubic-bezier\(\.2, \.8, \.25, 1\) both;/,
  'the opening chat panel must reuse the sent-message pop animation',
);
assert.match(
  source,
  /\.zq-social-backdrop-enter \{[^}]*animation: zq-social-backdrop-fade 280ms cubic-bezier\(\.2, \.8, \.25, 1\) both;/,
  'the backdrop must fade in at the same speed as the chat panel',
);
assert.match(
  source,
  /renderPanel\(root, \{ entering: true \}\);/,
  'opening the chat entry point must mark only its first render as entering',
);
assert.match(
  source,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.zq-social-backdrop-enter, #\$\{ROOT_ID\} \.zq-social-backdrop-enter \.zq-social-panel \{ animation: none; \}/,
  'the opening animation must respect reduced-motion preferences',
);

console.log('social chat opening animation: ok');
