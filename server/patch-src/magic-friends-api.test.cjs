const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = String(process.env.ZHIQU_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const sourceRoot = path.join(__dirname, 'com', 'zhiqu', 'server', 'magic');
const serviceSource = fs.readFileSync(path.join(sourceRoot, 'MagicFriendPresenceService.java'), 'utf8');
const controllerSource = fs.readFileSync(path.join(sourceRoot, 'MagicFriendPresenceController.java'), 'utf8');

assert.match(serviceSource, /Duration\.ofSeconds\(90\)/, 'online state must expire on the server');
assert.match(serviceSource, /social\.friends\(userId\)/, 'friend presence must start from the authenticated friend list');
assert.match(serviceSource, /room\.getStatus\(\)\.isActive\(\)/, 'game state must require an active room');
assert.match(serviceSource, /getMentorUserId|getNoviceUserId/, 'room membership must be verified');
assert.match(controllerSource, /RequestMapping\("\/api\/magic\/friends"\)/, 'controller path must match the contract');

async function request(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
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
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: { username: `${prefix}${suffix}`, password: 'SafePass123!', nickname },
  });
  assert.equal(response.status, 201, `register ${nickname}`);
  return response.payload;
}

(async () => {
  const unauthenticated = await request('/api/magic/friends');
  assert.equal(unauthenticated.status, 401, 'friend presence must require login');

  const alice = await register('magicfa', '魔法甲');
  const bob = await register('magicfb', '魔法乙');
  const carol = await register('magicfc', '魔法丙');

  const bobSocial = await request('/api/social/me', { token: bob.accessToken });
  assert.equal(bobSocial.status, 200);
  const friendRequest = await request('/api/social/friend-requests', {
    method: 'POST',
    token: alice.accessToken,
    body: { requestId: randomUUID(), friendCode: bobSocial.payload.friendCode },
  });
  assert.equal(friendRequest.status, 200, 'friend request should be created');

  const accepted = await request(`/api/social/friend-requests/${friendRequest.payload.id}/accept`, {
    method: 'POST',
    token: bob.accessToken,
    body: { requestId: randomUUID() },
  });
  assert.equal(accepted.status, 200, 'friend request should be accepted');

  const initial = await request('/api/magic/friends', { token: alice.accessToken });
  assert.equal(initial.status, 200);
  assert.equal(initial.payload.items.length, 1, 'only the authenticated user friends must be returned');
  assert.equal(initial.payload.items[0].nickname, '魔法乙');
  assert.equal(initial.payload.items[0].status, 'OFFLINE', 'a friend without heartbeat must be offline');

  const unrelatedHeartbeat = await request('/api/magic/friends/presence', {
    method: 'POST', token: carol.accessToken, body: { activeRoomId: null },
  });
  assert.equal(unrelatedHeartbeat.status, 200);
  const afterUnrelated = await request('/api/magic/friends', { token: alice.accessToken });
  assert.equal(afterUnrelated.payload.items.length, 1, 'online non-friends must not be exposed');

  const onlineHeartbeat = await request('/api/magic/friends/presence', {
    method: 'POST', token: bob.accessToken, body: { activeRoomId: null },
  });
  assert.equal(onlineHeartbeat.status, 200);
  const online = await request('/api/magic/friends', { token: alice.accessToken });
  assert.equal(online.payload.items[0].status, 'ONLINE');

  const bobRoom = await request('/api/magic-game-rooms', {
    method: 'POST', token: bob.accessToken, body: { requestId: randomUUID() },
  });
  assert.equal(bobRoom.status, 201, 'friend should be able to create a real magic room');
  const gameHeartbeat = await request('/api/magic/friends/presence', {
    method: 'POST', token: bob.accessToken, body: { activeRoomId: bobRoom.payload.id },
  });
  assert.equal(gameHeartbeat.status, 200);
  const inGame = await request('/api/magic/friends', { token: alice.accessToken });
  assert.equal(inGame.payload.items[0].status, 'IN_GAME');
  assert.equal(inGame.payload.items[0].activeRoomId, bobRoom.payload.id);

  const aliceRoom = await request('/api/magic-game-rooms', {
    method: 'POST', token: alice.accessToken, body: { requestId: randomUUID() },
  });
  assert.equal(aliceRoom.status, 201);
  const invitation = await request('/api/game-invitations', {
    method: 'POST',
    token: alice.accessToken,
    body: {
      requestId: randomUUID(),
      friendshipId: inGame.payload.items[0].friendshipId,
      gameCode: 'MAGIC',
      mode: 'USE_EXISTING_ROOM',
      roomId: aliceRoom.payload.id,
      taskMode: null,
    },
  });
  assert.equal(invitation.status, 201, 'existing invitation service must accept the verified friend and room');
  assert.equal(invitation.payload.gameCode, 'MAGIC');

  console.log(JSON.stringify({ result: 'ok', checks: 22 }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
