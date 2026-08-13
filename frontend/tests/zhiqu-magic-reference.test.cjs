const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const dist = path.join(frontendRoot, 'dist');
const scriptPath = path.join(dist, 'magic-reference.js');
const cssPath = path.join(dist, 'magic-reference.css');
const lobbyPath = path.join(dist, 'magic-lobby.html');
const assetRoot = path.join(dist, 'assets', 'figma-magic');

const script = fs.readFileSync(scriptPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const server = fs.readFileSync(path.join(frontendRoot, 'serve-static.cjs'), 'utf8');
const lobby = fs.readFileSync(lobbyPath, 'utf8');

assert.doesNotThrow(() => new vm.Script(script, { filename: 'magic-reference.js' }), 'magic lobby script must parse');
assert.match(css, /aspect-ratio:\s*852\s*\/\s*393/, 'stage must preserve the Figma frame ratio');
assert.match(css, /\.magic-ref-main \{[^}]*left:\s*29\.1%;[^}]*width:\s*40\.85%;[^}]*height:\s*67\.4%;/s, 'main card must retain measured Figma geometry');
assert.match(css, /\.magic-ref-rooms \{[^}]*top:\s*5\.4%;[^}]*left:\s*75\.2%;[^}]*width:\s*24\.8%;/s, 'room panel must use the enlarged readable landscape geometry');
assert.match(css, /prefers-reduced-motion/, 'motion preferences must be respected');
assert.match(css, /body\[data-zq-magic-lobby\] #root > \*:not\(\[data-magic-reference-shell\]\)/, 'lobby visibility isolation must not hide the in-place waiting room');

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
assert.match(css, /\.magic-ref-rooms::before/, 'all room states must cover the preset room artwork');
assert.match(css, /\.magic-ref-rooms::after[^}]*content:\s*"\\623f\\95f4"/s, 'the duplicated title in the source artwork must be replaced with one room title');
assert.doesNotMatch(css, /\.magic-ref-rooms::before[^}]*border:/s, 'the room artwork cover must not add an overlapping inner border');
assert.match(css, /\.magic-ref-rooms:not\(\.is-live\) \.magic-ref-create-hotspot/, 'the empty room panel must retain a real create-room command');
assert.match(script, /magic-ref-create-icon[\s\S]*magic-ref-create-label/, 'the create-room icon and label must use separate layout elements');
assert.match(css, /\.magic-ref-rooms:not\(\.is-live\) \.magic-ref-create-hotspot\s*\{[^}]*width:\s*48%;[^}]*height:\s*30%;[^}]*font-size:\s*clamp\(14px,\s*1\.65cqw,\s*18px\)/s, 'the empty-room create action must give its label enough visual space');
assert.match(css, /grid-template-rows:\s*3cqw auto[\s\S]*row-gap:\s*\.9cqw/, 'the empty-room create action must reserve clear icon and label rows');
assert.match(css, /\.magic-ref-rooms:not\(\.is-live\) \.magic-ref-create-icon\s*\{[^}]*font-size:\s*clamp\(22px,\s*2\.8cqw,\s*30px\)/s, 'the create-room star must remain legible without overpowering its label');
assert.match(script, /data-action="start"/, 'the Figma start control must remain interactive');
assert.match(script, /data-action="exit"/, 'the lobby must expose an exit control');
assert.match(script, /const exitLobby = \(\) =>/, 'exit must use the dedicated return transition');
assert.match(script, /returnState\.historyLength - globalThis\.history\.length[\s\S]*globalThis\.history\.go\(returnDelta\)/, 'exit must restore the exact existing community history entry instead of rebuilding it');
assert.match(script, /globalThis\.location\.replace\(returnState\?\.url \|\| '\/community\?section=games'\)/, 'direct lobby visits must retain a safe community fallback');
assert.match(script, /screen\?\.orientation\?\.unlock\?\.\(\)/, 'exit must release the landscape orientation request');
assert.match(script, /reduceMotion \? 100 : 420/, 'exit timing must stay short and respect reduced-motion preferences');
assert.match(script, /addEventListener\('popstate', cleanup\)/, 'same-document returns must remove the lobby immediately when history restores the community page');
assert.match(script, /removeAttribute\('data-zq-magic-lobby'\)/, 'leaving the lobby must release its visibility isolation before the room reveal');
assert.match(script, /exitCover\.className = 'magic-ref-exit-cover'/, 'exit must cover the orientation change with the game background');
assert.match(script, /exitCover\.classList\.add\('is-leaving'\)/, 'the exit cover must fade away after the community page is restored');
assert.match(script, /magic-ref-main-card[\s\S]*class="magic-ref-exit"/, 'the exit control must sit inside the main game panel');
assert.doesNotMatch(script, /<span>退出大厅<\/span>/, 'the compact exit control must not show a long text label');
assert.match(script, /<path d="M19 12H5"><\/path>[\s\S]*<path d="m12 19-7-7 7-7"><\/path>/, 'the exit control must use a stable back-arrow icon instead of a text glyph');
assert.match(css, /\.magic-ref-exit\s*\{[^}]*top:\s*3\.2%;[^}]*left:\s*3\.2%;[^}]*background:\s*linear-gradient/, 'exit control must use the game panel corner and its golden button language');
assert.doesNotMatch(css, /@keyframes magic-ref-exit-rotate/, 'exit must not rotate the complete lobby like a flat screenshot');
assert.match(css, /\.magic-ref-exit-cover\s*\{[^}]*z-index:\s*2147483647;[^}]*bag1\.png[^}]*animation:\s*magic-ref-exit-cover-in/, 'a full-viewport themed cover must hide the direction switch');
assert.match(css, /magic-ref-exit-stage[\s\S]*scale\(\.975\)/, 'the lobby content must settle inward subtly without appearing like a rotating picture');
assert.match(css, /magic-ref-exit-cover-out/, 'the themed exit cover must fade away over the restored community page');
assert.match(script, /startGame/, 'the start control must use the real room flow');
assert.match(script, /api\('\/api\/magic-game-rooms\/active'\)/, 'start must resume an existing active room');
assert.match(script, /if \(!room\?\.id\) \{[\s\S]*api\('\/api\/magic-game-rooms'/, 'an empty active-room response must create a new room');
assert.match(script, /response\.status === 401[\s\S]*refreshAccountSession\(currentSession\)[\s\S]*return api\(path, options, false\)/, 'lobby room actions must refresh an expired login session');
assert.match(script, /data-magic-feedback/, 'start failures must have a visible in-page feedback region');
assert.match(script, /syncFeedback\(\)/, 'lobby errors must be synchronized into the visible feedback region');
assert.match(script, /if \(!\[404, 204\]\.includes\(Number\(error\?\.status\)\)\) throw error/, 'active-room lookup must surface unexpected failures instead of silently swallowing them');
assert.match(script, /__zqOpenMagicRoom\(room\.id\)/, 'start must enter the resolved room through the covered in-place transition');
assert.match(script, /__zqOpenMagicRoom\(joinedRoomId\)/, 'public room joins must use the covered in-place transition');
assert.doesNotMatch(script, /requestAnimationFrame\(\(\) => globalThis\.requestAnimationFrame\(boot\)\)/, 'lobby overlay must not wait two animation frames and expose the legacy screen');
assert.match(script, /zq-magic-route-prepaint/, 'lobby overlay must release the server prepaint only after it mounts');
assert.match(script, /location\.assign\('\/settings'\)/, 'settings control must navigate to settings');
assert.match(script, /location\.assign\('\/rewards'\)/, 'ranking control must navigate to rewards');
assert.match(server, /magic-reference\.js/, 'the static server must inject the magic lobby overlay');
assert.match(server, /pathname === '\/magic'\) return path\.join\(root, 'magic-lobby\.html'\)/, 'the magic lobby route must bypass the legacy Expo document');
assert.match(server, /standaloneMagicLobby/, 'the standalone lobby must not receive unrelated legacy page scripts');
assert.match(server, /standaloneMagicLobby\s*\?\s*magicEntryNavigationScript/, 'a refreshed standalone lobby must retain the covered transition into its waiting room');
assert.match(server, /homeRecentMagicNavigationSource/, 'home recent game records must have a dedicated review route');
assert.match(lobby, /id="root"/, 'the standalone lobby must provide a clean mount point');
assert.doesNotMatch(lobby, /_expo|entry-/, 'the standalone lobby must not load the legacy Expo bundle');
assert.match(server, /data-zq-magic-landscape/, 'the static server must preserve landscape handling');
assert.match(server, /magicSafePatched = "safe:\{flex:1,backgroundColor:'#A8DDF3'/, 'the legacy magic root must use the forest sky fallback instead of purple');
assert.match(server, /communityMagicRoomNavigationPatched[\s\S]*__zqOpenMagicRoom\(t\)/, 'community magic room entries must use the same covered landscape transition');
assert.match(server, /communityMagicLobbyNavigationPatched[\s\S]*__zqOpenMagicLobby\(t\)/, 'the community game card must bypass the legacy in-app magic lobby route');
assert.match(server, /zq-magic-entry-transition[\s\S]*bag1\.png[\s\S]*history\.pushState\(\{ zqMagicLobby: true \}, '', target\)/, 'magic lobby entry must preserve the live community page behind its transition');
assert.match(server, /runtime\.destinationSelector[\s\S]*document\.querySelector\(selector\)[\s\S]*transition\.classList\.add\('is-revealing'\)/, 'the entry cover must remain until the requested landscape layer has mounted');
assert.match(server, /location\.replace\(target\)/, 'the in-place lobby must retain a full-document fallback');
assert.doesNotMatch(server, /zq-magic-entry-card|zq-magic-entry-card-rotate|zq-magic-entry-shine/, 'entry must not animate a detached fake copy of the main card');
assert.doesNotMatch(server, /@keyframes zq-magic-entry-rotate/, 'entry cover must hide the direction switch instead of visibly rotating like a picture');
assert.match(server, /orientation\.lock\('landscape'\)/, 'portrait entry must request the device landscape orientation when supported');
assert.match(server, /schedule\(navigate, reduceMotion \? 90 : 340\)/, 'the entry cover must leave enough time for click feedback and respect reduced-motion preferences');
assert.match(server, /zq-magic-entry-loader[\s\S]*正在进入画里藏词[\s\S]*zq-magic-entry-dots/, 'the direction switch must provide a compact themed progress cue');
assert.match(server, /globalThis\.__zqOpenMagicRoom[\s\S]*\[data-magic-room-reference-shell\]/, 'active room entry must wait for the landscape room shell before revealing');
assert.match(server, /sessionStorage\?\.setItem\('zhiqu\.magic\.return\.v1'/, 'entry must remember the live community page for a fast history return');
assert.match(server, /historyLength:\s*globalThis\.history\.length/, 'entry must remember the exact community history position');
assert.match(server, /__zqMagicEntryTransitionRuntimeV2/, 'repeated entries must share one transition lifecycle controller');
assert.doesNotMatch(server, /timers:\s*new Set\(\)/, 'the standalone transition controller must not depend on the legacy app polyfill runtime');
assert.match(server, /globalThis\[RUNTIME_KEY\]\?\.dispose\?\.\(\)/, 'reinjected entry scripts must dispose stale transition state');
assert.match(server, /const resetTransition = \(\) =>[\s\S]*clearScheduledWork\(\)[\s\S]*zq-magic-entry-transition[\s\S]*restoreOverflow\(\)/, 'each entry must remove a stale cover and restore page overflow before replaying');
assert.match(server, /transition\.addEventListener\('transitionend', removeTransition, \{ once: true \}\)[\s\S]*schedule\(removeTransition, 300\)/, 'cover removal must have both an event path and a bounded fallback');
assert.match(server, /schedule\(\(\) => \{[\s\S]*fallBackToDocument\(\);[\s\S]*\}, 3_200\)/, 'a stalled lobby mount must never leave the entry cover indefinitely');
assert.match(script, /__zqMagicEntryTransitionRuntimeV2\?\.complete\?\.\(\)/, 'the mounted lobby must actively complete any pending entry transition');
assert.match(script, /shell\.classList\.add\('is-entering'\)/, 'the real lobby components must share one coordinated entry state');
assert.match(css, /magic-ref-enter-main[\s\S]*magic-ref-enter-left[\s\S]*magic-ref-enter-right/, 'the final lobby layout must animate its main, left, and right regions in place');
assert.match(script, /script\.src\s*=\s*'\/magic-room-reference\.js'/, 'long-lived app tabs must load the room overlay after an internal magic-room route change');

console.log('Figma magic lobby: ok');
