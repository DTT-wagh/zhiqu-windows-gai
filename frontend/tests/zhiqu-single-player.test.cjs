const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const dist = path.join(frontendRoot, 'dist');
const scripts = [
  'api.js',
  'game-data.js',
  'game-shell.js',
  'prompt-writer.js',
  'image-detective.js',
  'sound-conductor.js',
  'route-and-conditions.js',
];

for (const scriptName of scripts) {
  const source = fs.readFileSync(path.join(dist, 'single-player', scriptName), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source, { filename: scriptName }), `${scriptName} must parse`);
}

const shellSource = fs.readFileSync(path.join(dist, 'single-player', 'game-shell.js'), 'utf8');
const shellContext = {};
vm.runInNewContext(shellSource, shellContext, { filename: 'game-shell.js' });
const shell = shellContext.ZhiquSinglePlayerShell;
assert.ok(shell, 'state machine must be exported for deterministic testing');

for (const gameCode of ['prompt-writer', 'image-detective', 'sound-conductor', 'route-and-conditions']) {
  const machine = shell.createStateMachine(shell.STATES.INTRO);
  assert.equal(machine.transition('START'), shell.STATES.GENERATING, `${gameCode}: intro -> generating`);
  assert.equal(machine.transition('READY'), shell.STATES.DEMO, `${gameCode}: generating -> demo`);
  assert.equal(machine.transition('BEGIN'), shell.STATES.ROUND_ACTIVE, `${gameCode}: demo -> first round`);
  for (let round = 1; round <= 3; round += 1) {
    assert.equal(machine.transition('SUBMIT'), shell.STATES.EVALUATING, `${gameCode}: round ${round} evaluates`);
    assert.equal(machine.transition('EVALUATED'), shell.STATES.FEEDBACK, `${gameCode}: round ${round} gives feedback`);
    assert.equal(
      machine.transition(round === 3 ? 'COMPLETE' : 'NEXT'),
      round === 3 ? shell.STATES.RESULT : shell.STATES.ROUND_ACTIVE,
      `${gameCode}: round ${round} advances correctly`,
    );
  }
  assert.throws(() => machine.transition('SUBMIT'), /Invalid single-player transition/);
}

const dataContext = {};
vm.runInNewContext(fs.readFileSync(path.join(dist, 'single-player', 'game-data.js'), 'utf8'), dataContext);
assert.equal(dataContext.ZhiquSinglePlayerData.list.length, 4, 'four games must be listed');
for (const game of dataContext.ZhiquSinglePlayerData.list) {
  assert.equal(game.levelNo, 1, `${game.gameCode} must expose one unified entry`);
  assert.equal('levels' in game, false, `${game.gameCode} must not expose a level catalog`);
  assert.ok(game.estimatedMinutes >= 5 && game.estimatedMinutes <= 8, `${game.gameCode} must fit one short session`);
}

const apiSource = fs.readFileSync(path.join(dist, 'single-player', 'api.js'), 'utf8');
const storage = new Map();
const calls = [];
const apiContext = {
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
  },
  location: { pathname: '/single-player-game', search: '?game=prompt-writer' },
  crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
  AbortController,
  setTimeout,
  clearTimeout,
  __ZHIQU_API_BASE_URL: 'http://api.example',
  fetch: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/auth/refresh')) {
      return { ok: true, json: async () => ({ accessToken: 'fresh-token', refreshToken: 'fresh-refresh' }) };
    }
    if (calls.filter((call) => call.url.endsWith('/api/single-player-games/progress')).length === 1) {
      return { ok: false, status: 401, text: async () => JSON.stringify({ code: 'UNAUTHORIZED', message: 'expired' }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify([]) };
  },
};
vm.runInNewContext(apiSource, apiContext, { filename: 'api.js' });
const api = apiContext.ZhiquSinglePlayerApi;

(async () => {
  await assert.rejects(api.progress(), (error) => error.status === 401 && error.code === 'UNAUTHORIZED');
  storage.set('zhiqu.auth.session.v1', JSON.stringify({ accessToken: 'stale-token', refreshToken: 'refresh-token' }));
  const progress = await api.progress();
  assert.ok(Array.isArray(progress) && progress.length === 0, '401 request must retry after refresh');
  assert.ok(calls.some((call) => call.url.endsWith('/api/auth/refresh')), 'refresh endpoint must be called');
  const protectedCalls = calls.filter((call) => call.url.endsWith('/api/single-player-games/progress'));
  assert.equal(protectedCalls.length, 2, 'protected request must retry once');
  assert.equal(protectedCalls[0].options.headers.Authorization, 'Bearer stale-token');
  assert.equal(protectedCalls[1].options.headers.Authorization, 'Bearer fresh-token');
  assert.equal(JSON.parse(storage.get('zhiqu.auth.session.v1')).accessToken, 'fresh-token');

  const requestId = api.createRequestId();
  await api.createInstance('prompt-writer', { requestId, levelNo: 1, ageBand: '6-8' });
  const createCall = calls.at(-1);
  assert.equal(createCall.options.headers['X-Request-Id'], requestId, 'write requests must carry the idempotency header');
  assert.match(apiSource, /new AbortController\(\)/, 'requests must support cancellation');
  assert.match(apiSource, /REQUEST_TIMEOUT/, 'request timeout must have a distinct error code');

  const lobby = fs.readFileSync(path.join(dist, 'zhiqu-placeholder-games.js'), 'utf8');
  for (const gameCode of ['prompt-writer', 'image-detective', 'sound-conductor', 'route-and-conditions']) {
    assert.ok(lobby.includes(gameCode), `${gameCode} card must be wired into the community lobby`);
  }
  assert.match(lobby, /\/single-player-game\?game=/, 'lobby cards must enter the standalone route');
  assert.doesNotMatch(lobby, /[?&]level=|12 关/, 'lobby cards must not expose a level selector');
  assert.doesNotMatch(lobby, /敬请期待|aria-disabled', 'true'/, 'cards must no longer be placeholders');

  const css = fs.readFileSync(path.join(dist, 'single-player', 'game.css'), 'utf8');
  assert.match(css, /min-height: 44px/, 'touch targets must be at least 44px');
  assert.match(css, /@media \(max-width: 760px\)/, 'mobile layout must be explicit');
  assert.match(css, /@media \(max-width: 430px\)/, '393px phone layout must have a dedicated breakpoint');
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/, 'phone intro steps must use a stable three-column grid');
  assert.match(css, /\.sp-primary, \.sp-secondary \{ width: 100%; min-height: 52px; \}/, 'phone actions must fill the available row');
  assert.match(css, /prefers-reduced-motion/, 'reduced motion must be supported');
  assert.match(shellSource, /本局内容暂时生成失败/, 'generation failure must be explicit');
  assert.match(shellSource, /重试生成/, 'generation failure must offer retry');
  assert.match(shellSource, /返回大厅/, 'generation failure must offer lobby return');
  assert.match(shellSource, /我看懂了/, 'the demo must lead into the three-round flow with one clear action');
  assert.match(shellSource, /再玩一次/, 'the result must offer replay as the primary action');
  assert.doesNotMatch(shellSource, /选择关卡|12 关可选|下一关/, 'the single-entry flow must not expose level navigation');
  assert.doesNotMatch(shellSource, /answerSpec|correctOptionIds|acceptedOptionIds/, 'answer specifications must not exist in frontend runtime');

  const imageGame = fs.readFileSync(path.join(dist, 'single-player', 'image-detective.js'), 'utf8');
  assert.match(imageGame, /beforeImageUrl/, 'the image game must compare the original and one-variable variant');
  assert.match(imageGame, /afterImageUrl/, 'the image game must render the generated variant');

  console.log(JSON.stringify({ result: 'ok', checks: 69, games: 4, entries: 4 }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
