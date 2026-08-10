const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'zhiqu-social-chat.js'), 'utf8');
const sendStart = source.indexOf('async function sendMessage(form)');
const sendBodyStart = source.indexOf('async function sendMessageBody(body, options = {})');
const nextFunction = source.indexOf('function openPanel(', sendBodyStart);

assert.ok(sendStart >= 0 && sendBodyStart > sendStart && nextFunction > sendBodyStart);

const sendSource = source.slice(sendStart, sendBodyStart);
const sendBodySource = source.slice(sendBodyStart, nextFunction);
const clearIndex = sendSource.indexOf("if (input) input.value = '';");
const requestIndex = sendSource.indexOf('await sendMessageBody(body');

assert.ok(clearIndex >= 0 && clearIndex < requestIndex, 'the visible composer must clear before the send request completes');
assert.match(sendSource, /state\.composerDraft = '';/);
assert.match(sendSource, /form\.dataset\.hasContent = 'false';/);
assert.match(sendSource, /if \(sent \|\| state\.activePartner\?\.id !== partnerId\) return;/);
assert.match(sendSource, /if \(!\(currentInput instanceof HTMLInputElement\) \|\| currentInput\.value\) return;/);
assert.match(sendSource, /currentInput\.value = originalDraft;/);
assert.doesNotMatch(sendBodySource, /clearDraft/, 'successful completion must not erase a newer draft');
assert.match(sendBodySource, /Promise\.allSettled/);
assert.match(sendBodySource, /return true;/);
assert.match(sendBodySource, /return false;/);

console.log('social chat composer clearing: ok');
