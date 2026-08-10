const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const dist = path.join(frontendRoot, 'dist');
const scriptPath = path.join(dist, 'magic-reference.js');
const cssPath = path.join(dist, 'magic-reference.css');
const assetRoot = path.join(dist, 'assets', 'figma-magic');

const script = fs.readFileSync(scriptPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const server = fs.readFileSync(path.join(frontendRoot, 'serve-static.cjs'), 'utf8');

assert.doesNotThrow(() => new vm.Script(script, { filename: 'magic-reference.js' }), 'magic lobby script must parse');
assert.match(css, /aspect-ratio:\s*852\s*\/\s*393/, 'stage must preserve the Figma frame ratio');
assert.match(css, /\.magic-ref-main \{[^}]*left:\s*29\.1%;[^}]*width:\s*40\.85%;[^}]*height:\s*67\.4%;/s, 'main card must retain measured Figma geometry');
assert.match(css, /\.magic-ref-rooms \{[^}]*left:\s*79\.2%;[^}]*width:\s*21\.1%;/s, 'room panel must retain measured Figma geometry');
assert.match(css, /prefers-reduced-motion/, 'motion preferences must be respected');

for (const asset of [
  'avatar-dog.png',
  'coin.png',
  'main-card.png',
  'mascot.png',
  'profile-banner.png',
  'rooms-panel.png',
  'star-large.png',
  'star-small.png',
  'treasure.png',
  'trophy.png',
]) {
  const stat = fs.statSync(path.join(assetRoot, asset));
  assert.ok(stat.size > 4_000, `${asset} must contain a committed Figma export`);
  assert.ok(script.includes(asset), `${asset} must be referenced by the lobby`);
}

assert.doesNotMatch(script, /figma\.com\/api\/mcp\/asset/, 'temporary Figma URLs must not ship in runtime code');
assert.match(script, /game-listings\?gameCode=MAGIC/, 'public magic rooms must still load from the existing API');
assert.match(script, /data-action="start"/, 'the Figma start control must remain interactive');
assert.match(script, /创建看图挑战\|创建房间/, 'start and create controls must delegate to the existing room flow');
assert.match(script, /location\.assign\('\/settings'\)/, 'settings control must navigate to settings');
assert.match(script, /location\.assign\('\/rewards'\)/, 'ranking control must navigate to rewards');
assert.match(server, /magic-reference\.js/, 'the static server must inject the magic lobby overlay');
assert.match(server, /data-zq-magic-landscape/, 'the static server must preserve landscape handling');

console.log('Figma magic lobby: ok');
