const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.join(__dirname, '..');
const fixSource = fs.readFileSync(path.join(frontendRoot, 'dist', 'zhiqu-nav-background.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(frontendRoot, 'serve-static.cjs'), 'utf8');

assert.match(fixSource, /zhiqu-nav-background-fix/);
assert.match(fixSource, /\.zq-ai-composer\{background:#f7f4ec!important\}/);
assert.match(fixSource, /\.zq-ai-global-nav\{box-shadow:none!important\}/);
assert.match(fixSource, /@media \(min-width:761px\)\{\.zq-ai-sidebar\{margin-bottom:calc\(-1 \* var\(--zq-ai-nav-height\)\)!important\}\}/);
assert.match(serverSource, /navBackgroundScript/);
assert.match(serverSource, /const tailScripts = standaloneRecords[\s\S]*?recordsReferenceScript[\s\S]*?standaloneSinglePlayer[\s\S]*?standaloneMagicLobby[\s\S]*?`\$\{magicEntryNavigationScript\}\$\{rewardsBackScript\}\$\{navBackgroundScript\}`/, 'ordinary Expo pages must retain the navigation background while standalone documents keep isolated runtimes');
console.log('nav background patch contract: ok');
