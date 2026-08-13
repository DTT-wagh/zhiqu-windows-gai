const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = String(process.env.ZHIQU_API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const patchSource = fs.readFileSync(path.join(__dirname, 'PatchMagicGameService.java'), 'utf8');

assert.match(patchSource, /boolean isLeave = "leave"\.equals\(name\)/, 'the room leave flow must be patched');
assert.match(
  patchSource,
  /if \(isLeave[\s\S]*"left"\.equals\(methodName\)[\s\S]*"closed"/,
  'the assembled room service must close a matched public listing when the novice leaves',
);

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
  const host = await register('magiclh', '生命周期房主');
  const novice = await register('magicln', '生命周期加入者');
  const observer = await register('magiclo', '生命周期观察者');

  const created = await request('/api/magic-game-rooms', {
    method: 'POST',
    token: host.accessToken,
    body: { requestId: randomUUID() },
  });
  assert.equal(created.status, 201, 'host creates a real magic room');

  const published = await request('/api/community/game-listings', {
    method: 'POST',
    token: host.accessToken,
    body: { requestId: randomUUID(), gameCode: 'MAGIC', roomId: created.payload.id },
  });
  assert.equal(published.status, 201, 'host publishes the real room');
  assert.equal(published.payload.status, 'OPEN');

  const joined = await request(`/api/community/game-listings/${encodeURIComponent(published.payload.id)}/join`, {
    method: 'POST',
    token: novice.accessToken,
    body: { requestId: randomUUID() },
  });
  assert.equal(joined.status, 200, 'novice joins through the public listing');
  assert.equal(joined.payload.roomId, created.payload.id);

  const left = await request(`/api/magic-game-rooms/${encodeURIComponent(created.payload.id)}/leave`, {
    method: 'POST',
    token: novice.accessToken,
  });
  assert.ok([200, 204].includes(left.status), 'novice can leave the waiting room');

  const publicRooms = await request('/api/community/game-listings?gameCode=MAGIC', {
    token: observer.accessToken,
  });
  assert.equal(publicRooms.status, 200);
  assert.equal(
    publicRooms.payload.items.some((item) => item.id === published.payload.id),
    false,
    'the exited room must not reappear as a public 1/2 room',
  );

  const mine = await request('/api/community/game-listings/mine', { token: host.accessToken });
  assert.equal(mine.status, 200);
  const listing = mine.payload.items.find((item) => item.id === published.payload.id);
  assert.equal(listing?.status, 'CLOSED', 'the host history must retain the listing as closed');

  console.log(JSON.stringify({ result: 'ok', checks: 13, roomId: created.payload.id }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
