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
assert.match(friendEntry, /openConversation\(\{/, 'friend chat actions must resolve into an active conversation');

console.log('social chat friend entry: ok');
