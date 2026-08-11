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
assert.doesNotMatch(script, /小画家|20205\/100000|>1258</, 'lobby account data must not be hard-coded');
assert.match(script, /accountRequest\('\/api\/users\/me'\)/, 'lobby must load the authenticated user profile');
assert.match(script, /accountRequest\('\/api\/rewards\/summary'\)/, 'lobby must load the authenticated reward summary');
assert.match(script, /api\/social\/avatars/, 'lobby must render the authenticated account avatar');
assert.match(script, /magic-ref-avatar-fallback[\s\S]*<svg/, 'missing uploaded avatars must use the same account avatar icon as the profile page');
assert.match(script, /UPLOADED_AVATAR_KEY\s*=\s*\/\^\[0-9a-fA-F\]\{32\}\$\//, 'only 32-character uploaded avatar keys may use the media endpoint');
assert.match(script, /'indigo-orbit'[\s\S]*'matcha-bot'[\s\S]*'steel-compass'/, 'built-in account avatars must render as presets instead of broken media URLs');
assert.doesNotMatch(script, /Array\.from\(nickname\)\[0\]/, 'account avatar fallback must not display the nickname initial');
assert.match(script, /api\/auth\/refresh/, 'expired account sessions must receive one refresh attempt');
assert.match(script, /summary\?\.totalXp/, 'star count must come from account total XP');
assert.match(script, /summary\?\.currentLevelXp/, 'level XP must come from the reward summary');
assert.match(script, /summary\?\.nextLevelXp/, 'level target must come from the reward summary');
assert.match(css, /--magic-profile-progress/, 'the XP bar width must use the synchronized account progress');
assert.match(css, /\.magic-ref-avatar\[hidden\]/, 'the authenticated avatar must support a first-character fallback');
assert.match(css, /\.magic-ref-avatar\s*\{[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/, 'the authenticated avatar must fill the profile circle');
assert.match(css, /\.magic-ref-avatar-fallback\s*\{[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;/, 'the default account avatar must fill the profile circle');
assert.match(script, /game-listings\?gameCode=MAGIC/, 'the lobby must load public magic rooms from the existing API');
assert.match(script, /roomNumber\s*=\s*\(room\)/, 'room cards must derive a visible room number');
assert.doesNotMatch(script, /10086|10087/, 'the lobby must not ship preset public room numbers');
assert.match(script, /data-action="join"/, 'public room cards must provide a join action');
assert.match(script, /data-action="create"/, 'the room panel must preserve the create-room hotspot');
assert.match(script, /game-listings\/\$\{encodeURIComponent\(room\.id\)\}\/join/, 'room joins must use the real public listing endpoint');
assert.doesNotMatch(script, /magic-ref-friend-list|data-action="invite"/, 'the reverted panel must not render the friend invitation UI');
assert.match(css, /\.magic-ref-room-list\s*\{[^}]*grid-template-rows:\s*repeat\(3,/, 'the restored room panel must retain three room slots');
assert.match(css, /\.magic-ref-rooms\.is-live \.magic-ref-room-list/, 'real room results must replace the static room artwork slots');
assert.match(css, /\.magic-ref-rooms:not\(\.is-live\)::before/, 'an empty public room list must cover the preset room artwork');
assert.match(css, /\.magic-ref-rooms:not\(\.is-live\) \.magic-ref-create-hotspot/, 'the empty room panel must retain a real create-room command');
assert.match(script, /data-action="start"/, 'the Figma start control must remain interactive');
assert.match(script, /startGame/, 'the start control must use the real room flow');
assert.match(script, /api\('\/api\/magic-game-rooms\/active'\)/, 'start must resume an existing active room');
assert.match(script, /if \(!room\?\.id\) \{[\s\S]*api\('\/api\/magic-game-rooms'/, 'an empty active-room response must create a new room');
assert.match(script, /location\.assign\(`\/magic\/\$\{encodeURIComponent\(room\.id\)\}`\)/, 'start must navigate to the resolved room');
assert.match(script, /location\.assign\('\/settings'\)/, 'settings control must navigate to settings');
assert.match(script, /location\.assign\('\/rewards'\)/, 'ranking control must navigate to rewards');
assert.match(server, /magic-reference\.js/, 'the static server must inject the magic lobby overlay');
assert.match(server, /data-zq-magic-landscape/, 'the static server must preserve landscape handling');

console.log('Figma magic lobby: ok');
