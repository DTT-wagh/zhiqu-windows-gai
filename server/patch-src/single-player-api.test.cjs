const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const jarPath = path.resolve(process.env.ZHIQU_SERVER_JAR || path.join(serverRoot, 'generated', 'zhiqu-server.jar'));
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-single-player-api-'));
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const payload = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, payload, checksum]);
}

function solidPng(size = 96) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  for (let row = 0; row < size; row += 1) {
    const offset = row * (size * 3 + 1);
    pixels[offset] = 0;
    for (let column = 0; column < size; column += 1) {
      pixels[offset + 1 + column * 3] = 230;
      pixels[offset + 2 + column * 3] = 240;
      pixels[offset + 3 + column * 3] = 232;
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

const tinyPng = solidPng();
let generationCounter = 0;
let promptGenerationCounter = 0;
let visionRequestCounter = 0;
let imageRequestCounter = 0;
let invalidPromptGroundingResponses = 0;

function option(id, label, extra = {}) {
  return { id, label, ...extra };
}

function sourceFact(factId, fieldKey, value, evidenceQuote) {
  return { factId, fieldKey, value, evidenceQuote };
}

function extractedFact(sourceFactId, fieldKey, value) {
  return { sourceFactId, fieldKey, value };
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
      roundId: 'r1', title: `对象观察 ${suffix}`, original: `一位同学正在整理彩色积木，记录编号${suffix}。`,
      sourceFacts: [
        sourceFact('r1-person', 'audience', '一位同学', '一位同学正在整理彩色积木'),
        sourceFact('r1-action', 'action', '整理', '正在整理彩色积木'),
        sourceFact('r1-object', 'object', '彩色积木', '整理彩色积木'),
      ],
      extractedFacts: [
        extractedFact('r1-action', 'action', '整理'),
        extractedFact('r1-object', 'object', '彩色积木'),
      ],
      aiExtracted: ['动作：整理', '对象：彩色积木'], prompt: 'AI 已经正确提取了哪一项原文信息？',
      options: [
        option('r1-good', '对象：彩色积木', { factId: 'r1-object', fieldKey: 'object', value: '彩色积木', clear: true, ambiguous: false, conflictGroup: '', changedField: '' }),
        option('r1-bad', '动作：整理', { factId: 'r1-action', fieldKey: 'action', value: '整理', clear: true, ambiguous: false, conflictGroup: '', changedField: '' }),
      ],
      answer: {
        rule: { type: 'FIELD', targetFactId: 'r1-object', targetField: 'object', ambiguousToken: '', conflictGroup: '', changedField: '' },
        hint: '对照原文和 AI 提取结果。', feedback: '对象“彩色积木”在两边都出现了。',
        comparison: { before: '原文有彩色积木', after: 'AI 提取了彩色积木' }, ability: ability(),
      },
    },
    {
      roundId: 'r2', title: `${secondRoundIsMissing ? '遗漏' : '含糊'}观察 ${suffix}`,
      original: secondRoundIsMissing
        ? `一位同学把两张卡片放到左边，记录编号${suffix}。`
        : `一位同学把那个放到左边，记录编号${suffix}。`,
      sourceFacts: secondRoundIsMissing
        ? [
          sourceFact('r2-person', 'audience', '一位同学', '一位同学把两张卡片放到左边'),
          sourceFact('r2-quantity', 'quantity', '两张', '两张卡片'),
          sourceFact('r2-object', 'object', '卡片', '两张卡片'),
          sourceFact('r2-action', 'action', '放到', '放到左边'),
          sourceFact('r2-location', 'location', '左边', '放到左边'),
        ]
        : [
          sourceFact('r2-person', 'audience', '一位同学', '一位同学把那个放到左边'),
          sourceFact('r2-object', 'object', '那个', '把那个放到左边'),
          sourceFact('r2-action', 'action', '放到', '放到左边'),
          sourceFact('r2-location', 'location', '左边', '放到左边'),
        ],
      extractedFacts: secondRoundIsMissing
        ? [
          extractedFact('r2-person', 'audience', '一位同学'),
          extractedFact('r2-object', 'object', '卡片'),
          extractedFact('r2-action', 'action', '放到'),
          extractedFact('r2-location', 'location', '左边'),
        ]
        : [
          extractedFact('r2-person', 'audience', '一位同学'),
          extractedFact('r2-object', 'object', '不确定（那个）'),
          extractedFact('r2-action', 'action', '放到'),
          extractedFact('r2-location', 'location', '左边'),
        ],
      aiExtracted: secondRoundIsMissing ? ['动作：放置', '位置：左边'] : ['对象：不确定', '位置：左边'],
      prompt: secondRoundIsMissing ? 'AI 漏掉了哪一项信息？' : 'AI 的哪一项提取仍不确定？',
      options: secondRoundIsMissing
        ? [
          option('r2-good', '数量：两张', { factId: 'r2-quantity', fieldKey: 'quantity', value: '两张', clear: false, ambiguous: false, conflictGroup: '', changedField: '' }),
          option('r2-bad', '地点：左边', { factId: 'r2-location', fieldKey: 'location', value: '左边', clear: true, ambiguous: false, conflictGroup: '', changedField: '' }),
        ]
        : [
          option('r2-good', '对象：“那个”', { factId: 'r2-object', fieldKey: 'object', value: '那个', clear: false, ambiguous: true, conflictGroup: '', changedField: '' }),
          option('r2-bad', '地点：左边', { factId: 'r2-location', fieldKey: 'location', value: '左边', clear: true, ambiguous: false, conflictGroup: '', changedField: '' }),
        ],
      answer: secondRoundIsMissing
        ? {
          rule: { type: 'MISSING', targetFactId: 'r2-quantity', targetField: 'quantity', ambiguousToken: '', conflictGroup: '', changedField: '' },
          hint: '比较原句和 AI 提取结果中的数量。', feedback: '原句写了“两张”，但 AI 没有提取数量。',
          comparison: { before: '原句包含两张', after: 'AI 结果没有数量' }, ability: ability(),
        }
        : {
          rule: { type: 'AMBIGUITY', targetFactId: 'r2-object', targetField: 'object', ambiguousToken: '那个', conflictGroup: '', changedField: '' },
          hint: '找出不能直接知道具体对象的词。', feedback: '“那个”没有说明具体对象，所以 AI 仍然不确定。',
          comparison: { before: '原句使用“那个”', after: 'AI 标记对象不确定' }, ability: ability(),
        },
    },
    {
      roundId: 'r3', title: `单变量观察 ${suffix}`,
      original: `画三朵花，记录编号${suffix}。`,
      sourceFacts: [
        sourceFact('r3-object', 'object', '花', '画三朵花'),
        sourceFact('r3-action', 'action', '画', '画三朵花'),
        sourceFact('r3-quantity', 'quantity', '三朵', '画三朵花'),
      ],
      extractedFacts: [
        extractedFact('r3-object', 'object', '花'),
        extractedFact('r3-action', 'action', '画'),
        extractedFact('r3-quantity', 'quantity', '三朵'),
      ],
      aiExtracted: ['对象：花', '数量：三朵', '动作：画'],
      prompt: '如果把“画三朵花”改成“画五朵花”，哪个信息改变了？',
      options: [
        option('r3-quantity-option', '数量从“三朵”变成“五朵”', { factId: 'r3-quantity', fieldKey: 'quantity', beforeValue: '三朵', afterValue: '五朵', value: '五朵', changedField: 'quantity' }),
        option('r3-object-option', '对象从“花”变成“树”', { factId: 'r3-object', fieldKey: 'object', beforeValue: '花', afterValue: '树', value: '树', changedField: 'object' }),
        option('r3-action-option', '动作从“画”变成“折”', { factId: 'r3-action', fieldKey: 'action', beforeValue: '画', afterValue: '折', value: '折', changedField: 'action' }),
      ],
      answer: {
        rule: { type: 'CHANGE', targetFactId: 'r3-action', targetField: 'action', ambiguousToken: '', conflictGroup: '', changedField: 'action' },
        hint: '模型故意给错了规则。', feedback: '模型故意给错了规则。',
        comparison: { before: '模型声称动作改变', after: '程序应根据题干纠正' }, ability: ability(),
      },
    },
  ];
  const game = {
    safety: { status: 'REJECTED', reason: '模拟本地儿童安全误判，完整关卡仍应通过' },
    instruction: `观察本局句子怎样被 AI 拆成字段，${suffix}。`,
    demo: {
      title: '对象示范', original: `请整理 ${suffix}`, aiExtracted: ['动作：整理'],
      explanation: '补上本局生成的对象后，AI 提取的信息多了一项。',
    },
    rounds,
    result: { discovery: `模型只返回了不完整总结 ${suffix}` },
  };
  if (invalidPromptGroundingResponses > 0) {
    invalidPromptGroundingResponses -= 1;
    game.rounds[1] = {
      roundId: 'r2', title: '错误遗漏观察',
      original: '在公园里，小明和小红一起喂了 3 只鸽子。',
      sourceFacts: [
        sourceFact('bad-location', 'location', '公园', '在公园里'),
        sourceFact('bad-person', 'audience', '小明和小红', '小明和小红一起喂了 3 只鸽子'),
        sourceFact('bad-action', 'action', '喂', '一起喂了 3 只鸽子'),
        sourceFact('bad-quantity', 'quantity', '3 只', '3 只鸽子'),
        sourceFact('bad-object', 'object', '鸽子', '3 只鸽子'),
      ],
      extractedFacts: [
        extractedFact('bad-location', 'location', '公园'),
        extractedFact('bad-person', 'audience', '小明和小红'),
        extractedFact('bad-action', 'action', '喂'),
        extractedFact('bad-quantity', 'quantity', '3 只'),
        extractedFact('bad-object', 'object', '鸽子'),
      ],
      aiExtracted: ['地点：公园', '人物：小明和小红', '动作：喂', '数量：3 只', '对象：鸽子'],
      prompt: 'AI 漏掉了哪一项信息？',
      options: [
        option('r2-good', 'AI 漏掉了时间', { factId: 'bad-time', fieldKey: 'condition', value: '时间', clear: false, ambiguous: false, conflictGroup: '', changedField: '' }),
        option('r2-bad', 'AI 没说喂什么食物', { factId: 'bad-food', fieldKey: 'object', value: '食物', clear: false, ambiguous: false, conflictGroup: '', changedField: '' }),
      ],
      answer: {
        rule: { type: 'MISSING', targetFactId: 'bad-time', targetField: 'condition', ambiguousToken: '', conflictGroup: '', changedField: '' },
        hint: '想想鸽子吃什么。', feedback: 'AI 漏掉了喂食时间。',
        comparison: { before: '原文没有时间', after: '声称 AI 漏掉时间' }, ability: ability(),
      },
    };
  }
  return game;
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
    safety: { status: 'SAFE', reason: '原创生活场景' }, instruction: '比较同一张生活场景完整图和缺失图，找出最能帮助 AI 识别目标的元素。',
    sceneSpec: {
      target: { id: 'target', label: '孩子正在把苹果放进篮子', recognitionPrompt: '判断孩子是否正在把苹果放进篮子' },
      imagePrompt: '原创儿童生活场景插画：孩子在厨房把苹果放进篮子，旁边有冰箱贴和水槽边的蓝色抹布，不含文字和真实人物。',
      elements: [
        { id: 'basket', label: '装苹果的篮子', role: 'CRITICAL', category: '收纳容器', purpose: '盛放苹果', visualTrait: '藤编开口篮', bbox: { x: 12, y: 58, width: 26, height: 24 } },
        { id: 'sticker', label: '冰箱上的星星贴纸', role: 'IRRELEVANT', category: '装饰贴纸', purpose: '装饰冰箱门', visualTrait: '黄色星形纸片', bbox: { x: 66, y: 14, width: 20, height: 18 } },
        { id: 'cloth', label: '水槽边的蓝色抹布', role: 'IRRELEVANT', category: '清洁用品', purpose: '擦干水槽边缘', visualTrait: '蓝色折叠布料', bbox: { x: 56, y: 64, width: 24, height: 18 } },
      ],
    },
    result: resultDetails('我发现不同元素对 AI 识别目标的作用不同。', '这个模型的判断只适用于本局图片。'),
  };
}

function recognition() {
  return {
    safety: { status: 'SAFE', reason: '画面安全' },
    detections: [
      { sceneElementId: 'basket', label: '装苹果的篮子', confidence: 0.93, relation: '在孩子前方' },
      { sceneElementId: 'sticker', label: '冰箱上的星星贴纸', confidence: 0.89, relation: '在冰箱上' },
      { sceneElementId: 'cloth', label: '水槽边的蓝色抹布', confidence: 0.88, relation: '在水槽旁' },
    ],
    targetRecognition: { targetLabel: '孩子正在把苹果放进篮子', detected: true, confidence: 0.93, description: 'AI 判断孩子正在把苹果放进篮子。' },
    altText: 'AI 看到孩子正在把苹果放进篮子，旁边有冰箱贴和蓝色抹布。',
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
        assert.ok(body.prompt.includes('生活场景') && body.prompt.includes('物品'), 'image prompts must describe generated daily-life elements');
        assert.ok(body.prompt.length <= 1400, 'image prompts must stay within the structured prompt cap');
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: [{ b64_json: tinyPng }] }));
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
        const text = Array.isArray(user) ? user.find((item) => item.type === 'text')?.text || '' : '';
        let analysis = {};
        try { analysis = JSON.parse(text.replace(/^sceneSpec=/, '')); } catch { /* malformed analysis is handled by the API */ }
        const visible = (id) => analysis.elements?.find((item) => item.id === id)?.visible !== false;
        const basketVisible = visible('basket');
        const stickerVisible = visible('sticker');
        const clothVisible = visible('cloth');
        if (basketVisible) {
          openAiResponse(response, recognition());
          return;
        }
        const missing = recognition();
        missing.detections = [
          ...(stickerVisible ? [{ sceneElementId: 'sticker', label: '冰箱上的星星贴纸', confidence: 0.84, relation: '在冰箱上' }] : []),
          ...(clothVisible ? [{ sceneElementId: 'cloth', label: '水槽边的蓝色抹布', confidence: 0.82, relation: '在水槽旁' }] : []),
        ];
        missing.targetRecognition = {
          targetLabel: '孩子正在把苹果放进篮子',
          detected: false,
          confidence: stickerVisible || clothVisible ? 0.20 : 0.18,
          description: stickerVisible || clothVisible
            ? 'AI 仍然不能确定孩子正在把苹果放进篮子。'
            : 'AI 只看到孩子在厨房附近，不能确定正在把苹果放进篮子。',
        };
        missing.altText = stickerVisible || clothVisible
          ? 'AI 仍然不能确定孩子正在把苹果放进篮子。'
          : 'AI 看到孩子和桌面，但没有确定正在把苹果放进篮子。';
        openAiResponse(response, missing);
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
  const body = { requestId: randomUUID(), levelNo };
  if (gameCode !== 'prompt-writer') body.ageBand = '6-8';
  const response = await request(baseUrl, `/api/single-player-games/${gameCode}/instances`, {
    method: 'POST', token,
    body,
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
    assert.deepEqual(catalogResponse.payload.find((game) => game.gameCode === 'prompt-writer').ageBands, [],
      'prompt writer must not advertise an age choice');
    assert.equal((await request(baseUrl, '/api/single-player-games/progress')).status, 401, 'progress must require JWT');

    const alice = await register(baseUrl, 'spalice');
    const bob = await register(baseUrl, 'spbob');
    const initialProgress = await request(baseUrl, '/api/single-player-games/progress', { token: alice.accessToken });
    assert.equal(initialProgress.payload.length, 4, 'progress must return one status per game');
    assert.ok(initialProgress.payload.every((item) => item.completed === false));

    const invalidLevel = await request(baseUrl, '/api/single-player-games/prompt-writer/instances', {
      method: 'POST', token: alice.accessToken,
      body: { requestId: randomUUID(), levelNo: 2 },
    });
    assert.equal(invalidLevel.status, 400, 'new instances must use the single levelNo=1 entry');

    const created = await create(baseUrl, alice.accessToken, 'prompt-writer', 1);
    const ready = await waitInstance(baseUrl, alice.accessToken, created.instanceId);
    assert.equal(ready.status, 'READY');
    assert.equal(ready.contentVersion, 'spg-v6');
    assert.equal(ready.ageBand, '9-10', 'prompt writer must use the unified internal content band without asking the child');
    assert.match(ready.modelName, /^PromptBank-db:/);
    assert.equal(ready.content.rounds.length, 3);
    assert.deepEqual(ready.content.rounds.map((round) => round.title.split('：')[0]), ['基础', '进阶', '综合']);
    assert.ok(ready.content.rounds.every((round) => Array.isArray(round.sourceFacts) && Array.isArray(round.extractedFacts)));
    assert.match(ready.content.rounds[0].prompt, /“(对象|动作|地点)”/, 'round one must name the target field so only one option is correct');
    assert.ok(ready.content.rounds[1].sourceFacts.every((fact) => ready.content.rounds[1].original.includes(fact.evidenceQuote)));
    assert.ok(ready.content.rounds[1].options.every((item) => item.factId && !/时间|食物/.test(item.label)));
    assert.ok(ready.content.rounds[1].options.every((item) => !/AI 已提取|AI 未提取/.test(item.label)));
    assert.ok(['evidence', 'aiCorrect', 'uncertain', 'change', 'discovery', 'limitation']
      .every((key) => typeof ready.content.result[key] === 'string' && ready.content.result[key].length > 0));
    assertNoAnswerSpec(ready.content);
    const fieldLabels = { object: '对象', action: '动作', location: '地点', quantity: '数量', audience: '人物' };
    const r1TargetFact = ready.content.rounds[0].sourceFacts.find((fact) =>
      ready.content.rounds[0].prompt.includes(`“${fieldLabels[fact.fieldKey]}”`));
    const r2ExtractedIds = new Set(ready.content.rounds[1].extractedFacts.map((fact) => fact.sourceFactId));
    const r2TargetFact = ready.content.rounds[1].sourceFacts.find((fact) => !r2ExtractedIds.has(fact.factId));
    const r3TargetOption = ready.content.rounds[2].options.find((item) => item.afterValue !== item.beforeValue);
    const correctOptionIds = {
      r1: ready.content.rounds[0].options.find((item) => item.factId === r1TargetFact.factId).id,
      r2: ready.content.rounds[1].options.find((item) => item.factId === r2TargetFact.factId).id,
      r3: r3TargetOption.id,
    };
    assert.ok(ready.content.rounds[2].prompt.includes(r3TargetOption.beforeValue));
    assert.ok(ready.content.rounds[2].prompt.includes(r3TargetOption.afterValue));
    assert.ok(ready.content.rounds[2].changedOriginal.includes(r3TargetOption.afterValue));
    assert.ok(ready.content.rounds[2].changedAiExtracted.some((item) => item.includes(r3TargetOption.afterValue)));
    assert.equal(ready.content.rounds[2].options.filter((item) => item.afterValue !== item.beforeValue).length, 1);
    assert.ok(ready.content.rounds[2].options.filter((item) => item.id !== r3TargetOption.id)
      .every((item) => /没有改变/.test(item.label)));
    const wrongR1Id = ready.content.rounds[0].options.find((item) => item.id !== correctOptionIds.r1).id;

    const foreignRead = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}`, { token: bob.accessToken });
    assert.equal(foreignRead.status, 404, 'another user must not read the instance');

    const wrongRequestId = randomUUID();
    const wrong = await request(baseUrl, `/api/single-player-games/instances/${created.instanceId}/rounds/r1/submit`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: wrongRequestId, action: { selectedIds: [wrongR1Id] } },
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

    for (const [roundId, optionId] of Object.entries(correctOptionIds)) {
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
    assert.match(replayReady.content.rounds[1].prompt, /原文中确实出现/);
    assert.ok(replayReady.content.rounds[1].options.every((item) => !/AI 已提取|AI 未提取/.test(item.label)));

    invalidPromptGroundingResponses = 1;
    const hallucinatedCreated = await create(baseUrl, alice.accessToken, 'prompt-writer', 1);
    const hallucinatedResult = await waitInstance(baseUrl, alice.accessToken, hallucinatedCreated.instanceId);
    assert.equal(hallucinatedResult.status, 'READY', 'the reviewed database bank must remain available');
    assert.match(hallucinatedResult.modelName, /^PromptBank-db:/);
    assert.equal(hallucinatedResult.failureCode, null);
    assert.ok(hallucinatedResult.content.rounds.flatMap((round) => round.options)
      .every((item) => !/时间|食物|AI 已提取|AI 未提取/.test(item.label)));
    assert.ok(hallucinatedResult.content.rounds[2].changedOriginal);
    assert.equal(promptGenerationCounter, 0, 'runtime prompt games must not call live AI while reviewed database content exists');

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
    assert.equal(imageReady.status, 'READY', `image detective generation details: ${JSON.stringify(imageReady)}`);
    assert.ok(imageRequestCounter >= 2, 'the complete image must be regenerated after a rejected vision result');
    assert.ok(visionRequestCounter >= 5, 'a rejected vision result must automatically regenerate and verify each candidate removal');
    assert.match(imageReady.content.imageUrl, /^\/api\/single-player-games\/media\//);
    assert.match(imageReady.content.variantImageUrl, /^\/api\/single-player-games\/media\//);
    assert.match(imageReady.content.completeImageUrl, /^\/api\/single-player-games\/media\//);
    assert.match(imageReady.content.missingImageUrl, /^\/api\/single-player-games\/media\//);
    assert.notEqual(imageReady.content.variantImageUrl, imageReady.content.imageUrl);
    assert.equal(imageReady.content.rounds.length, 1, 'image detective must contain one finished-on-submit round');
    assert.match(imageReady.content.rounds[0].beforeImageUrl, /^\/api\/single-player-games\/media\//);
    assert.match(imageReady.content.rounds[0].afterImageUrl, /^\/api\/single-player-games\/media\//);
    assert.equal(imageReady.content.rounds[0].options.length, 3, 'image detective must expose three distinct candidate elements');
    assert.equal(imageReady.content.candidateElements.length, 3, 'age 6-8 must expose three candidate element cards');
    assert.equal(new Set(imageReady.content.candidateElements.map((item) => item.category)).size, 3, 'candidate categories must be visibly distinct');
    assert.ok(imageReady.content.rounds[0].options.every((item) => item.description.includes(' · ')), 'each candidate must explain its category, purpose, and position');
    assert.ok(imageReady.content.altText.includes('孩子'), 'image content must expose generated alt text');
    assertNoAnswerSpec(imageReady.content);
    const mediaResponse = await fetch(baseUrl + imageReady.content.imageUrl);
    assert.equal(mediaResponse.status, 200, 'generated image must use the dedicated media endpoint');
    assert.equal(mediaResponse.headers.get('content-type'), 'image/png');
    const imageSubmission = await request(baseUrl, `/api/single-player-games/instances/${imageCreated.instanceId}/rounds/r1/submit`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: randomUUID(), action: { selectedIds: ['r1-basket'] } },
    });
    assert.equal(imageSubmission.status, 200);
    assert.equal(imageSubmission.payload.correct, true);
    assert.equal(imageSubmission.payload.currentRound, 1);
    assert.equal(imageSubmission.payload.allRoundsComplete, true, 'one image submission must finish the game flow');
    const imageFinish = await request(baseUrl, `/api/single-player-games/instances/${imageCreated.instanceId}/finish`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: randomUUID(), discovery: '我先比较左右两张图，再找出关键元素。' },
    });
    assert.equal(imageFinish.status, 200, 'one submitted image-detective answer must be eligible for finish');

    const imageWrongCreated = await create(baseUrl, alice.accessToken, 'image-detective', 1);
    const imageWrongReady = await waitInstance(baseUrl, alice.accessToken, imageWrongCreated.instanceId);
    assert.equal(imageWrongReady.status, 'READY');
    const imageWrongSubmission = await request(baseUrl, `/api/single-player-games/instances/${imageWrongCreated.instanceId}/rounds/r1/submit`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: randomUUID(), action: { selectedIds: ['r1-sticker'] } },
    });
    assert.equal(imageWrongSubmission.status, 200);
    assert.equal(imageWrongSubmission.payload.correct, false, 'the comparison choice must remain distinguishable');
    assert.equal(imageWrongSubmission.payload.currentRound, 1, 'an incorrect one-round image answer must still advance to reflection');
    assert.equal(imageWrongSubmission.payload.allRoundsComplete, true);
    const imageWrongFinish = await request(baseUrl, `/api/single-player-games/instances/${imageWrongCreated.instanceId}/finish`, {
      method: 'POST', token: alice.accessToken,
      body: { requestId: randomUUID(), discovery: '下次我会先看两张图中最影响目标判断的物品。' },
    });
    assert.equal(imageWrongFinish.status, 200, 'an incorrect image answer must still be eligible for its reflection summary');

    await stopApi(apiProcess);
    apiProcess = null;

    const noAiPort = await freePort();
    const noAiBase = `http://127.0.0.1:${noAiPort}`;
    unconfiguredProcess = startApi(noAiPort, providerPort, 'unconfigured', false);
    await waitForHealth(noAiBase, unconfiguredProcess);
    const unconfiguredUser = await register(noAiBase, 'spnoai');
    const bankOnlyCreated = await request(noAiBase, '/api/single-player-games/prompt-writer/instances', {
      method: 'POST', token: unconfiguredUser.accessToken,
      body: { requestId: randomUUID(), levelNo: 1 },
    });
    assert.equal(bankOnlyCreated.status, 202, 'the reviewed bank must work without a configured text model');
    const bankOnlyReady = await waitInstance(noAiBase, unconfiguredUser.accessToken, bankOnlyCreated.payload.instanceId);
    assert.equal(bankOnlyReady.status, 'READY');
    assert.match(bankOnlyReady.modelName, /^PromptBank-db:/);

    console.log(JSON.stringify({ result: 'ok', checks: 82, generatedInstances: 7 }));
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
