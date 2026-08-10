const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const jarPath = path.resolve(process.env.ZHIQU_SERVER_JAR || path.join(serverRoot, 'generated', 'zhiqu-server.jar'));
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-single-player-api-'));
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlXQAAAAASUVORK5CYII=';
let generationCounter = 0;
let promptGenerationCounter = 0;
let visionRequestCounter = 0;
let imageRequestCounter = 0;

function option(id, label, extra = {}) {
  return { id, label, ...extra };
}

function ability() {
  return { taskCompletion: 1, evidenceUse: 1, revisionQuality: 1, explanationClarity: 1 };
}

function resultDetails(discovery, limitation) {
  return {
    evidence: '我用本局原始信息核对了 AI 的判断。',
    aiCorrect: 'AI 提取出了一部分可观察信息。',
    uncertain: limitation,
    change: discovery,
    discovery,
    limitation,
  };
}

function promptGame(levelNo) {
  generationCounter += 1;
  promptGenerationCounter += 1;
  const suffix = `局次${generationCounter}`;
  const secondRoundIsMissing = promptGenerationCounter % 2 === 0;
  const rounds = [
    {
      roundId: 'r1', title: `对象观察 ${suffix}`, original: `请观察这句实时短句 ${suffix}`,
      aiExtracted: ['动作：整理'], prompt: '哪一项补清楚了对象？',
      options: [
        option('r1-good', '彩色积木', { fieldKey: 'object', value: '彩色积木', clear: true, ambiguous: false, conflictGroup: '', changedField: '' }),
        option('r1-bad', '快一点', { fieldKey: 'action', value: '快一点', clear: false, ambiguous: true, conflictGroup: '', changedField: '' }),
      ],
      answer: {
        rule: { type: 'FIELD', targetField: 'object', ambiguousToken: '', conflictGroup: '', changedField: '' },
        hint: '回到句子里，找出“整理什么”还没有说清。', feedback: '你补出了本句缺少的对象“彩色积木”。',
        comparison: { before: '只知道整理', after: '知道整理彩色积木' }, ability: ability(),
      },
    },
    {
      roundId: 'r2', title: `${secondRoundIsMissing ? '遗漏' : '含糊'}观察 ${suffix}`,
      original: secondRoundIsMissing ? `把两张卡片放到左边 ${suffix}` : `把那个放到左边 ${suffix}`,
      aiExtracted: secondRoundIsMissing ? ['动作：放置', '位置：左边'] : ['对象：不确定', '位置：左边'],
      prompt: secondRoundIsMissing ? 'AI 漏掉了哪一项信息？' : 'AI 的哪一项提取仍不确定？',
      options: secondRoundIsMissing
        ? [
          option('r2-good', '数量：两张', { fieldKey: 'quantity', value: '两张', clear: false, ambiguous: false, conflictGroup: '', changedField: '' }),
          option('r2-bad', '位置：左边', { fieldKey: 'location', value: '左边', clear: true, ambiguous: false, conflictGroup: '', changedField: '' }),
        ]
        : [
          option('r2-good', '对象：“那个”', { fieldKey: 'object', value: '那个', clear: false, ambiguous: true, conflictGroup: '', changedField: '' }),
          option('r2-bad', '位置：左边', { fieldKey: 'location', value: '左边', clear: true, ambiguous: false, conflictGroup: '', changedField: '' }),
        ],
      answer: secondRoundIsMissing
        ? {
          rule: { type: 'MISSING', targetField: 'quantity', ambiguousToken: '', conflictGroup: '', changedField: '' },
          hint: '比较原句和 AI 提取结果中的数量。', feedback: '原句写了“两张”，但 AI 没有提取数量。',
          comparison: { before: '原句包含两张', after: 'AI 结果没有数量' }, ability: ability(),
        }
        : {
          rule: { type: 'AMBIGUITY', targetField: 'object', ambiguousToken: '那个', conflictGroup: '', changedField: '' },
          hint: '找出不能直接知道具体对象的词。', feedback: '“那个”没有说明具体对象，所以 AI 仍然不确定。',
          comparison: { before: '原句使用“那个”', after: 'AI 标记对象不确定' }, ability: ability(),
        },
    },
    {
      roundId: 'r3', title: `单变量观察 ${suffix}`, original: `只改变地点，看看提取怎样变化 ${suffix}`,
      aiExtracted: ['对象：图形', '地点：桌面'], prompt: '哪一项只改变了地点？',
      options: [
        option('r3-good', '地点改为展示架', { fieldKey: 'location', value: '展示架', clear: true, ambiguous: false, conflictGroup: '', changedField: 'location' }),
        option('r3-bad', '数量和地点都改变', { fieldKey: 'quantity', value: '三个', clear: true, ambiguous: false, conflictGroup: '', changedField: 'multiple' }),
      ],
      answer: {
        rule: { type: 'CHANGE', targetField: '', ambiguousToken: '', conflictGroup: '', changedField: 'location' },
        hint: '检查前后是不是只有地点一个字段不同。', feedback: '这次只改变地点，所以可以把判断变化和地点联系起来。',
        comparison: { before: '地点是桌面', after: '地点是展示架' }, ability: ability(),
      },
    },
  ];
  return {
    safety: { status: 'SAFE', reason: '适龄结构内容' },
    instruction: `观察本局句子怎样被 AI 拆成字段，${suffix}。`,
    demo: {
      title: '对象示范', original: `请整理 ${suffix}`, aiExtracted: ['动作：整理'],
      explanation: '补上本局生成的对象后，AI 提取的信息多了一项。',
    },
    rounds,
    result: resultDetails(
      `我发现 ${suffix} 中，一个字段变化会让 AI 的提取结果跟着变化。`,
      'AI 只能读取句子里已有的信息，不知道没有写出的真实想法。',
    ),
  };
}

function routeGame() {
  const task = (maxDistance = null) => ({
    objective: 'DISTANCE',
    constraints: { maxDistance, maxTime: null, maxCost: null, minSafety: null, requiredMetrics: ['distance'], requireCompleteInformation: false },
    weights: { distance: 1, time: 0, cost: 0, safety: 0 },
  });
  return {
    safety: { status: 'SAFE', reason: '抽象虚构图' },
    themeLabel: `星点图${++generationCounter}`,
    graph: {
      startId: 'A', endId: 'D',
      nodes: [
        { id: 'A', label: '起点', x: 10, y: 50 },
        { id: 'B', label: '圆台', x: 40, y: 20 },
        { id: 'C', label: '方台', x: 40, y: 80 },
        { id: 'D', label: '终点', x: 88, y: 50 },
      ],
      edges: [
        { id: 'ab', from: 'A', to: 'B', distance: 4, time: 5, cost: 2, safety: 5 },
        { id: 'bd', from: 'B', to: 'D', distance: 5, time: 4, cost: 2, safety: 5 },
        { id: 'ac', from: 'A', to: 'C', distance: 5, time: 3, cost: 1, safety: 3 },
        { id: 'cd', from: 'C', to: 'D', distance: 5, time: 3, cost: 1, safety: 3 },
        { id: 'bc', from: 'B', to: 'C', distance: 3, time: 2, cost: 3, safety: 2 },
      ],
    },
    tasks: [task(), task(), task(), task(12)],
  };
}

function soundGame() {
  const sequence = {
    tempo: 96, dynamics: 'MEDIUM', instrumentFamily: 'KEYS', meter: 4, mood: '轻快',
    notes: [
      { midi: 60, beats: 1 }, { midi: 64, beats: 1 }, { midi: 67, beats: 1 }, { midi: 72, beats: 1 },
    ],
  };
  return {
    safety: { status: 'SAFE', reason: '无歌词原创结构' }, instruction: '听本局结构化乐段并找证据。',
    demo: { title: '速度示范', sequence, explanation: '每分钟拍数是速度证据。' },
    rounds: [1, 2, 3].map((number) => {
      const changed = number === 3;
      return {
        roundId: `r${number}`, title: changed ? '速度变化' : '速度观察', prompt: changed ? '哪一个声音参数改变了？' : '这个乐段的速度属于哪一档？',
        sequence: changed ? { ...sequence, tempo: 126 } : sequence,
        options: changed
          ? [option(`r${number}-good`, '速度', { value: 'TEMPO', kind: 'CHOICE', evidenceMetric: 'TEMPO' }), option(`r${number}-bad`, '力度', { value: 'DYNAMICS', kind: 'CHOICE', evidenceMetric: 'DYNAMICS' })]
          : [option(`r${number}-good`, '中速', { value: 'MEDIUM', kind: 'CHOICE', evidenceMetric: 'TEMPO' }), option(`r${number}-bad`, '快速', { value: 'FAST', kind: 'CHOICE', evidenceMetric: 'TEMPO' })],
        answer: {
          questionType: changed ? 'CHANGE' : 'TEMPO', changedMetric: changed ? 'TEMPO' : '', hint: '看看每分钟拍数。',
          feedback: changed ? '只有速度从 96 BPM 变成了 126 BPM。' : '96 BPM 属于程序设定的中速范围。',
          comparison: { beforeTempo: 96, afterTempo: changed ? 126 : 96 }, ability: ability(),
        },
      };
    }),
    result: resultDetails('我发现 96 BPM 给出了可测量的速度证据。', '同一速度仍可能让不同的人产生不同感受。'),
  };
}

function imageGame() {
  return {
    safety: { status: 'SAFE', reason: '原创抽象场景' }, instruction: '观察本局图片和视觉识别结果。',
    sceneSpec: {
      imagePrompt: '原创儿童插画，绿色圆形盒子上方有黄色三角旗，不含文字和真实人物。',
      elements: [
        { id: 'box', label: '绿色圆形盒子', primary: true, color: '深绿色', shape: '圆形', x: 50, y: 60, relation: '在下方' },
        { id: 'flag', label: '黄色三角旗', primary: false, color: '亮黄色', shape: '三角形', x: 50, y: 25, relation: '在盒子上方' },
      ],
    },
    variantSceneSpec: {
      imagePrompt: '原创儿童插画，蓝色圆形盒子上方有黄色三角旗，不含文字和真实人物。',
      elements: [
        { id: 'box', label: '蓝色圆形盒子', primary: true, color: '深蓝色', shape: '圆形', x: 50, y: 60, relation: '在下方' },
        { id: 'flag', label: '黄色三角旗', primary: false, color: '亮黄色', shape: '三角形', x: 50, y: 25, relation: '在盒子上方' },
      ],
    },
    change: { elementId: 'box', field: 'color', before: '深绿色', after: '深蓝色' },
    demo: { title: '主体示范', explanation: '主体同时有形状和位置证据。' },
    rounds: [1, 2, 3].map((number) => ({
      roundId: `r${number}`, title: '元素观察', prompt: '哪个选项对应画面主体？',
      options: [option(`r${number}-good`, '绿色圆形盒子', { elementId: 'box', value: 'box', key: 'element' }), option(`r${number}-bad`, '黄色三角旗', { elementId: 'flag', value: 'flag', key: 'element' })],
      answer: { targetElementId: 'box', targetValue: 'box', targetKey: 'element', hint: '同时看大小、形状和位置。', feedback: '主体盒子被图片规格和视觉模型同时识别。', comparison: { element: 'box' }, ability: ability() },
    })),
    result: resultDetails('我发现主体需要多条画面证据。', '视觉模型仍可能漏看小元素。'),
  };
}

function recognition() {
  return {
    safety: { status: 'SAFE', reason: '画面安全' },
    detections: [
      { sceneElementId: 'box', label: '绿色圆形盒子', confidence: 0.96, relation: '在下方' },
      { sceneElementId: 'flag', label: '黄色三角旗', confidence: 0.93, relation: '在盒子上方' },
    ],
    altText: '一只绿色圆形盒子位于画面下方，一面黄色三角旗在盒子上方。',
  };
}

function openAiResponse(response, payload) {
  const body = JSON.stringify({ choices: [{ message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } }] });
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(body);
}

function createFakeProvider() {
  return http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      if (request.url.endsWith('/images/generations')) {
        const body = JSON.parse(raw);
        imageRequestCounter += 1;
        assert.equal(body.quality, 'low', 'single-player images must use the latency-friendly quality tier');
        assert.equal(body.size, '512x512', 'single-player images must fit the mobile game surface without oversized generation');
        assert.ok(body.prompt.includes('元素清晰分开'), 'image prompts must use the compact structured scene description');
        assert.ok(body.prompt.length <= 600, 'image prompts must stay within the latency-friendly length cap');
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'provider_busy' } }));
        return;
      }
      let body;
      try { body = JSON.parse(raw); } catch { response.writeHead(400).end(); return; }
      const system = body.messages?.[0]?.content || '';
      const user = body.messages?.[1]?.content;
      if (system.includes('视觉核验器')) {
        assert.equal(body.thinking?.type, 'disabled', 'MiniMax-M3 vision requests must disable thinking text');
        visionRequestCounter += 1;
        if (visionRequestCounter === 1) {
          openAiResponse(response, { safety: { status: 'REJECTED', reason: '模拟一次视觉安全误判' } });
          return;
        }
        openAiResponse(response, recognition());
        return;
      }
      let context = {};
      try { context = JSON.parse(user || '{}'); } catch { /* visual requests use array content */ }
      if (system.includes('抽象路线图')) openAiResponse(response, routeGame());
      else if (system.includes('声音小指挥')) openAiResponse(response, soundGame());
      else if (system.includes('图片侦探')) openAiResponse(response, imageGame());
      else openAiResponse(response, promptGame(context.levelNo));
    });
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function startApi(port, providerPort, name, configured) {
  const work = path.join(tempRoot, name);
  fs.mkdirSync(work, { recursive: true });
  const database = path.join(work, 'zhiqu').replaceAll('\\', '/');
  const env = {
    ...process.env,
    SERVER_PORT: String(port),
    DB_URL: `jdbc:h2:file:${database};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1`,
    APP_ALLOWED_ORIGINS: 'http://127.0.0.1:8082,http://localhost:8082',
    APP_JWT_SECRET: 'single-player-api-test-secret-long-enough',
    SPRING_CONFIG_IMPORT: `optional:file:${path.join(work, 'missing.properties').replaceAll('\\', '/')}`,
    DASHSCOPE_BASE_URL: configured ? `http://127.0.0.1:${providerPort}/v1` : '',
    DASHSCOPE_API_KEY: configured ? 'test-key' : '',
    DASHSCOPE_MODEL: 'test-text-model',
    MAGIC_IMAGE_BASE_URL: configured ? `http://127.0.0.1:${providerPort}` : '',
    MAGIC_IMAGE_API_KEY: configured ? 'test-image-key' : '',
    MAGIC_IMAGE_MODEL: configured ? 'test-image-model' : '',
    SINGLE_PLAYER_VISION_BASE_URL: configured ? `http://127.0.0.1:${providerPort}/v1` : '',
    SINGLE_PLAYER_VISION_API_KEY: configured ? 'test-vision-key' : '',
    SINGLE_PLAYER_VISION_MODEL: configured ? 'MiniMax-M3' : '',
    SINGLE_PLAYER_AI_TIMEOUT_SECONDS: '1',
    MEDIA_ROOT: path.join(work, 'media'),
  };
  const child = spawn('java', ['-jar', jarPath], { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-60000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-60000); });
  child.output = () => output;
  return child;
}

async function stopApi(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited early:\n${child.output()}`);
    try {
      const response = await fetch(`${baseUrl}/actuator/health`);
      if (response.ok) return;
    } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API did not become healthy:\n${child.output()}`);
}

async function request(baseUrl, pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}

async function register(baseUrl, prefix) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const response = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { username: `${prefix}${suffix}`, password: 'SafePass123!', nickname: prefix },
  });
  assert.equal(response.status, 201, `register ${prefix}`);
  return response.payload;
}

async function waitInstance(baseUrl, token, instanceId, wanted = ['READY', 'FAILED', 'REJECTED']) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const response = await request(baseUrl, `/api/single-player-games/instances/${instanceId}`, { token });
    assert.equal(response.status, 200);
    if (wanted.includes(response.payload.status)) return response.payload;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw new Error(`instance ${instanceId} did not reach ${wanted.join('/')}`);
}

function assertNoAnswerSpec(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!['answer', 'answerSpec', 'acceptedOptionIds', 'correctOptionIds', 'solverResult'].includes(key), `response leaked ${key}`);
    assertNoAnswerSpec(child);
  }
}

async function create(baseUrl, token, gameCode, levelNo) {
  const response = await request(baseUrl, `/api/single-player-games/${gameCode}/instances`, {
    method: 'POST', token,
    body: { requestId: randomUUID(), levelNo, ageBand: '6-8' },
  });
  assert.equal(response.status, 202, `create ${gameCode} level ${levelNo}`);
  return response.payload;
}

(async () => {
  assert.ok(fs.existsSync(jarPath), 'run apply-patches.cjs before the API test');
  const provider = createFakeProvider();
  const providerPort = await listen(provider);
  let apiProcess;
  let unconfiguredProcess;
  try {
    const apiPort = await freePort();
    const baseUrl = `http://127.0.0.1:${apiPort}`;
    apiProcess = startApi(apiPort, providerPort, 'configured', true);
    await waitForHealth(baseUrl, apiProcess);

    const catalogResponse = await request(baseUrl, '/api/single-player-games');
    assert.equal(catalogResponse.status, 200, 'catalog must be public');
    assert.equal(catalogResponse.payload.length, 4);
    assert.ok(catalogResponse.payload.every((game) => game.levelNo === 1 && !('levels' in game)));
    assert.equal((await request(baseUrl, '/api/single-player-games/progress')).status, 401, 'progress must require JWT');

    const alice = await register(baseUrl, 'spalice');
    const bob = await register(baseUrl, 'spbob');
    const initialProgress = await request(baseUrl, '/api/single-player-games/progress', { token: alice.accessToken });
    assert.equal(initialProgress.payload.length, 4, 'progress must return one status per game');
    assert.ok(initialProgress.payload.every((item) => item.completed === false));

    const invalidLevel = await request(baseUrl, '/api/single-player-games/prompt-writer/instances', {
      method: 'POST', token: alice.accessToken,
      body: { requestId: randomUUID(), levelNo: 2, ageBand: '6-8' },
    });
    assert.equal(invalidLevel.status, 400, 'new instances must use the single levelNo=1 entry');

    const created = await create(baseUrl, alice.accessToken, 'prompt-writer', 1);
    const ready = await waitInstance(baseUrl, alice.accessToken, created.instanceId);
    assert.equal(ready.status, 'READY');
    assert.equal(ready.content.rounds.length, 3);
    assertNoAnswerSpec(ready.content);

    const foreignRead = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}`, { token: bob.accessToken });
    assert.equal(foreignRead.status, 404, 'another user must not read the instance');

    const wrongRequestId = randomUUID();
    const wrong = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}/rounds/r1/submit`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: wrongRequestId, action: { selectedIds: ['r1-bad'] } },
    });
    assert.equal(wrong.status, 200);
    assert.equal(wrong.payload.correct, false);
    assert.equal(wrong.payload.currentRound, 0);
    const duplicateWrong = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}/rounds/r1/submit`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: wrongRequestId, action: { selectedIds: ['r1-good'] } },
    });
    assert.equal(duplicateWrong.payload.submissionId, wrong.payload.submissionId, 'requestId must not be evaluated twice');
    assert.equal(duplicateWrong.payload.correct, false, 'duplicate request must keep its first evaluation');

    for (const [roundId, optionId] of [['r1', 'r1-good'], ['r2', 'r2-good'], ['r3', 'r3-good']]) {
      const submission = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}/rounds/${roundId}/submit`, {
        method: 'POST', token: alice.accessToken,
        body: { requestId: randomUUID(), action: { selectedIds: [optionId] } },
      });
      assert.equal(submission.status, 200);
      assert.equal(submission.payload.correct, true, `${roundId} must accept the program-derived choice: ${JSON.stringify(submission.payload)}`);
    }

    const finish = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}/finish`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: randomUUID(), discovery: '我发现改变一个字段时，提取结果也会改变。' },
    });
    assert.equal(finish.status, 200);
    assert.equal(finish.payload.status, 'COMPLETED');
    const repeatedFinish = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}/finish`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: randomUUID(), discovery: '' },
    });
    assert.equal(repeatedFinish.status, 200);
    assert.equal(repeatedFinish.payload.reward.ledgerId, finish.payload.reward.ledgerId, 'repeat finish must not grant another reward');
    assert.equal(repeatedFinish.payload.reward.awardedXp, finish.payload.reward.awardedXp);
    const progress = await request(baseUrl, '/api/single-player-games/progress', { token: alice.accessToken });
    assert.equal(progress.payload.length, 4);
    assert.ok(progress.payload.some((item) => item.gameCode === 'prompt-writer' && item.completed));
    assert.ok(progress.payload.every((item) => !('levelNo' in item)), 'progress must be keyed by game rather than level');

    const replay = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}/regenerate`, {
      method: 'POST', token: alice.accessToken, body: { requestId: randomUUID() },
    });
    assert.equal(replay.status, 202);
    assert.notEqual(replay.payload.instanceId, created.instanceId, 'replay must create a fresh instance');
    assert.equal(replay.payload.levelNo, 1);
    const replayReady = await waitInstance(baseUrl, alice.accessToken, replay.payload.instanceId);
    assert.equal(replayReady.status, 'READY', 'the MISSING comparison variant must generate successfully');

    const routeCreated = await create(baseUrl, alice.accessToken, 'route-and-conditions', 1);
    const routeReady = await waitInstance(baseUrl, alice.accessToken, routeCreated.instanceId);
    assert.equal(routeReady.status, 'READY');
    assertNoAnswerSpec(routeReady.content);
    assert.equal(routeReady.modelName.includes('RouteSolver-v1'), true);

    const soundCreated = await create(baseUrl, alice.accessToken, 'sound-conductor', 1);
    const soundReady = await waitInstance(baseUrl, alice.accessToken, soundCreated.instanceId);
    assert.equal(soundReady.status, 'READY');
    assert.equal(soundReady.content.rounds[0].sequence.tempo, 96, 'sound content must keep the generated BPM');
    assert.equal(soundReady.content.rounds[0].sequence.notes.length, 4, 'sound content must carry live note data');
    assertNoAnswerSpec(soundReady.content);

    const imageCreated = await create(baseUrl, alice.accessToken, 'image-detective', 1);
    const imageReady = await waitInstance(baseUrl, alice.accessToken, imageCreated.instanceId);
    assert.equal(imageReady.status, 'READY');
    assert.ok(imageRequestCounter >= 4, 'provider failures must fall back to local scene rendering on both generation attempts');
    assert.ok(visionRequestCounter >= 3, 'a rejected vision result must automatically regenerate once');
    assert.match(imageReady.content.imageUrl, /^\/api\/single-player-games\/media\//);
    assert.match(imageReady.content.variantImageUrl, /^\/api\/single-player-games\/media\//);
    assert.notEqual(imageReady.content.variantImageUrl, imageReady.content.imageUrl);
    assert.match(imageReady.content.rounds[2].beforeImageUrl, /^\/api\/single-player-games\/media\//);
    assert.match(imageReady.content.rounds[2].afterImageUrl, /^\/api\/single-player-games\/media\//);
    assert.ok(imageReady.content.altText.includes('绿色圆形盒子'), 'image content must expose generated alt text');
    assertNoAnswerSpec(imageReady.content);
    const mediaResponse = await fetch(baseUrl + imageReady.content.imageUrl);
    assert.equal(mediaResponse.status, 200, 'generated image must use the dedicated media endpoint');
    assert.equal(mediaResponse.headers.get('content-type'), 'image/png');

    await stopApi(apiProcess);
    apiProcess = null;

    const noAiPort = await freePort();
    const noAiBase = `http://127.0.0.1:${noAiPort}`;
    unconfiguredProcess = startApi(noAiPort, providerPort, 'unconfigured', false);
    await waitForHealth(noAiBase, unconfiguredProcess);
    const unconfiguredUser = await register(noAiBase, 'spnoai');
    const unavailable = await request(noAiBase, '/api/single-player-games/prompt-writer/instances', {
      method: 'POST', token: unconfiguredUser.accessToken,
      body: { requestId: randomUUID(), levelNo: 1, ageBand: '6-8' },
    });
    assert.equal(unavailable.status, 503, 'missing text model must be an explicit 503');
    assert.equal(unavailable.payload.code, 'SINGLE_PLAYER_AI_NOT_CONFIGURED');

    console.log(JSON.stringify({ result: 'ok', checks: 58, generatedInstances: 5 }));
  } finally {
    await stopApi(apiProcess);
    await stopApi(unconfiguredProcess);
    await new Promise((resolve) => provider.close(resolve));
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
