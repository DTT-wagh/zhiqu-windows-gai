const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const dist = path.join(frontendRoot, 'dist');
const server = fs.readFileSync(path.join(frontendRoot, 'serve-static.cjs'), 'utf8');
const originalLobby = fs.readFileSync(path.join(dist, 'blind-box', 'index.html'), 'utf8');

assert.doesNotMatch(server, /blindBoxReferenceScript|blindBoxLobbyScript|<script src="\/blind-box-reference\.js"><\/script>/, 'the static server must not replace the original blind-box UI with an overlay');
assert.match(server, /data-zq-blind-box-landscape/, 'the static server must enable portrait-to-landscape handling');
assert.match(server, /data-zq-blind-box-lobby-shell/, 'the original lobby must receive a route-scoped landscape layout hook');
assert.match(server, /grid-template-columns:\s*minmax\(250px, 0\.82fr\)\s+minmax\(390px, 1\.18fr\)/, 'the original lobby must use a two-column landscape layout');
assert.match(server, /data-zq-blind-box-room-lobby/, 'the waiting room must receive a state-scoped landscape layout hook');
assert.match(server, /data-zq-blind-box-room-shell/, 'the original waiting room must be rearranged without replacing its UI');
assert.match(server, /grid-template-columns:\s*minmax\(250px, 0\.86fr\)\s+minmax\(390px, 1\.14fr\)/, 'the waiting room must use a two-column landscape layout');
assert.match(server, /data-zq-blind-box-room-invite/, 'the invitation card must stay inside the room layout');
assert.match(server, /\\u8fd4\\u56de\\u76f2\\u76d2\\u5927\\u5385/, 'the room hook must use the original blind-box back button label');
assert.match(server, /base\.hostname=location\.hostname/, 'mobile clients must send API requests to the computer host instead of Android localhost');
assert.match(server, /apiRuntimeBasePatched/, 'the bundled API client must read the runtime API base');
assert.match(server, /e instanceof y\.ApiClientError\?e\.message/, 'audio upload failures must show the backend error message');
assert.match(originalLobby, /<div id="root">/, 'the original Expo blind-box lobby must remain available');

console.log('Original blind-box UI restoration: ok');
