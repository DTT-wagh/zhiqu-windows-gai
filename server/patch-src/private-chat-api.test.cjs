const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const baseUrl = String(process.env.ZHIQU_API_BASE_URL || 'http://127.0.0.1:18080').replace(/\/+$/, '');

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}

async function register(prefix, nickname) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const result = await request('/api/auth/register', {
    method: 'POST',
    body: { username: `${prefix}${suffix}`, password: 'SafePass123!', nickname },
  });
  assert.equal(result.status, 201, `register ${prefix}`);
  assert.ok(result.payload?.accessToken, `register ${prefix} should return a token`);
  return result.payload;
}

function errorText(payload) {
  return String(payload?.detail || payload?.message || payload?.error || payload || '');
}

(async () => {
  const alice = await register('alice', '小艾');
  const bob = await register('bob', '小博');
  const aliceToken = alice.accessToken;
  const bobToken = bob.accessToken;
  const aliceId = alice.user.id;
  const bobId = bob.user.id;

  const search = await request(`/api/chat/users?q=${encodeURIComponent(bob.user.username)}`, { token: aliceToken });
  assert.equal(search.status, 200, 'non-friend user search should remain available');
  const bobSearchResult = search.payload.find((item) => item.id === bobId);
  assert.ok(bobSearchResult, 'search should find the non-friend user');

  const nonFriendMessage = await request(`/api/chat/conversations/${bobId}/messages`, {
    method: 'POST', token: aliceToken, body: { body: '你好', requestId: randomUUID() },
  });
  assert.equal(nonFriendMessage.status, 403, `non-friends must not send messages: ${JSON.stringify(nonFriendMessage.payload)}`);
  assert.match(errorText(nonFriendMessage.payload), /双方成为好友后才能聊天/);

  const nonFriendMessages = await request(`/api/chat/conversations/${bobId}/messages`, { token: aliceToken });
  assert.equal(nonFriendMessages.status, 403, 'non-friends must not read chat messages');
  const emptyConversations = await request('/api/chat/conversations', { token: aliceToken });
  assert.equal(emptyConversations.status, 200);
  assert.deepEqual(emptyConversations.payload, [], 'failed non-friend send must not create a conversation');

  assert.ok(bobSearchResult.publicProfileId, 'friend application requires a public profile id');
  const friendRequest = await request('/api/social/friend-requests/by-profile', {
    method: 'POST',
    token: aliceToken,
    body: { requestId: randomUUID(), publicProfileId: bobSearchResult.publicProfileId },
  });
  assert.equal(friendRequest.status, 200, 'friend application should remain available');
  assert.ok(friendRequest.payload?.id, 'friend application should return its id');
  const accepted = await request(`/api/social/friend-requests/${friendRequest.payload.id}/accept`, {
    method: 'POST', token: bobToken, body: { requestId: randomUUID() },
  });
  assert.equal(accepted.status, 200, 'friend application should be accepted');

  const unsafeMessages = [
    ['手机号码', '我的电话是 13800138000'],
    ['QQ号码', '加 QQ 1234567'],
    ['微信号', '微信号 abcdef_1'],
    ['邮箱', '邮箱 alice@example.com'],
    ['地址信息', '我住在北京市朝阳区幸福路 10 号'],
  ];
  for (const [label, body] of unsafeMessages) {
    const blocked = await request(`/api/chat/conversations/${bobId}/messages`, {
      method: 'POST', token: aliceToken, body: { body, requestId: randomUUID() },
    });
    assert.equal(blocked.status, 400, `${label} should be blocked`);
    assert.match(errorText(blocked.payload), new RegExp(label));
  }

  const tooLong = await request(`/api/chat/conversations/${bobId}/messages`, {
    method: 'POST', token: aliceToken, body: { body: '学'.repeat(501), requestId: randomUUID() },
  });
  assert.equal(tooLong.status, 400, 'messages over 500 characters should be blocked');

  const customSticker = await request(`/api/chat/conversations/${bobId}/messages`, {
    method: 'POST',
    token: aliceToken,
    body: { body: '[[zq-sticker:0123456789abcdef0123456789abcdef.png]]', requestId: randomUUID() },
  });
  assert.equal(customSticker.status, 403, 'custom image sticker messages should be blocked');
  const stickerRegistration = await request('/api/chat/stickers', {
    method: 'POST', token: aliceToken, body: { key: '0123456789abcdef0123456789abcdef.png' },
  });
  assert.equal(stickerRegistration.status, 403, 'custom sticker registration should be disabled');
  const stickerList = await request('/api/chat/stickers', { token: aliceToken });
  assert.equal(stickerList.status, 200);
  assert.deepEqual(stickerList.payload, [], 'custom sticker list should be empty');

  const messageRequestId = randomUUID();
  const firstSend = await request(`/api/chat/conversations/${bobId}/messages`, {
    method: 'POST', token: aliceToken, body: { body: '一起复习数学吧', requestId: messageRequestId },
  });
  assert.equal(firstSend.status, 200, 'friends should send messages');
  assert.equal(firstSend.payload.status, 'APPROVED');
  const repeatedSend = await request(`/api/chat/conversations/${bobId}/messages`, {
    method: 'POST', token: aliceToken, body: { body: '这次请求不应新建消息', requestId: messageRequestId },
  });
  assert.equal(repeatedSend.status, 200, 'idempotent retry should succeed');
  assert.equal(repeatedSend.payload.id, firstSend.payload.id, 'same requestId should return the existing message');
  assert.equal(repeatedSend.payload.body, firstSend.payload.body, 'idempotent retry must not replace the body');

  const concurrentRequestId = randomUUID();
  const concurrentRequests = [1, 2].map(() => request(`/api/chat/conversations/${bobId}/messages`, {
    method: 'POST', token: aliceToken, body: { body: '并发重试只保存一次', requestId: concurrentRequestId },
  }));
  const [concurrentFirst, concurrentSecond] = await Promise.all(concurrentRequests);
  assert.equal(concurrentFirst.status, 200);
  assert.equal(concurrentSecond.status, 200);
  assert.equal(concurrentFirst.payload.id, concurrentSecond.payload.id, 'concurrent retries should return one message');

  const messages = await request(`/api/chat/conversations/${bobId}/messages`, { token: aliceToken });
  assert.equal(messages.status, 200);
  assert.deepEqual(messages.payload.map((message) => message.id), [firstSend.payload.id, concurrentFirst.payload.id]);
  assert.ok(messages.payload.every((message) => message.status === 'APPROVED'), 'only approved messages should display');
  const conversations = await request('/api/chat/conversations', { token: aliceToken });
  assert.equal(conversations.status, 200);
  assert.equal(conversations.payload.length, 1);
  assert.equal(conversations.payload[0].partnerId, bobId);
  assert.equal(conversations.payload[0].status, 'ACCEPTED');

  console.log(JSON.stringify({
    result: 'ok',
    aliceId,
    bobId,
    checks: 20 + unsafeMessages.length,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
