const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'zhiqu-social-chat.js'), 'utf8');

assert.match(
  source,
  /const API_BASE = String\(globalThis\.__ZHIQU_API_BASE_URL \|\| 'http:\/\/localhost:8080'\)/,
  'private chat must use the local API when the static server did not inject an API base',
);

const friendEntry = source.slice(source.indexOf('async function openChatForFriend'), source.indexOf('function closePanel'));
assert.match(friendEntry, /openPanel\(false\)/, 'clicking a friend chat action must open the chat panel directly');
assert.doesNotMatch(friendEntry, /openPanel\(true\)/, 'friend chat actions must not route through the search panel');
assert.match(friendEntry, /openConversation\(partner, 'chat'\)/, 'friend chat actions must resolve into an active conversation');
assert.match(friendEntry, /candidate\.publicProfileId === profileId/, 'friend chat actions must reuse an existing conversation by public profile id');
assert.match(friendEntry, /\/api\/chat\/friends\/by-profile\//, 'new friend conversations must resolve the accepted friend by public profile id');
assert.doesNotMatch(friendEntry, /\/api\/chat\/users\?q=/, 'friend chat actions must not depend on a nickname search');

const panelSource = source.slice(source.indexOf('function renderPanel'), source.indexOf('function renderSearch'));
assert.match(panelSource, /state\.friendPickerMode \? '新建对话' : '消息'/, 'the inbox must be labelled as messages and expose a separate new-conversation state');
assert.match(panelSource, /data-action="open-friend-picker"/, 'the message header must expose a new-conversation control');
assert.doesNotMatch(panelSource, /找同学，不用笔友码/, 'the message list must not duplicate friend discovery');
assert.doesNotMatch(panelSource, /data-action="toggle-search"/, 'the message list must not toggle into account search');
assert.match(source, /function renderFriendPicker\(\)/, 'new conversations must choose from accepted friends');
assert.match(source, /globalThis\.__zqOpenSocialSearch = \(\) => openPanel\(true\)/, 'friend discovery must remain a dedicated relationship-management entry');

console.log('social chat friend entry: ok');
