const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const jarPath = path.join(serverRoot, 'generated', 'zhiqu-server.jar');
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-ai-cancel-test-'));

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function modelResponse(reply) {
  return JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          reply,
          intent: 'CHAT',
          sourceIds: [],
          recommendations: [],
          safety: { status: 'SAFE', reason: '' },
          conversationSummary: '取消测试会话',
        }),
      },
    }],
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function startProvider() {
  let delayNextResponse = true;
  let delayedStartedResolve;
  let providerAborted = false;
  const delayedStarted = new Promise((resolve) => { delayedStartedResolve = resolve; });
  const server = http.createServer(async (request, response) => {
    const body = JSON.parse(await readBody(request));
    const context = JSON.parse(body.messages.at(-1).content);
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    if (context.operation === 'RESPOND' && delayNextResponse) {
      delayNextResponse = false;
      delayedStartedResolve();
      const timer = setTimeout(() => {
        if (!response.writableEnded) response.end(modelResponse('这条回复不应被保存'));
      }, 15_000);
      response.on('close', () => {
        if (!response.writableEnded) {
          providerAborted = true;
          clearTimeout(timer);
        }
      });
      return;
    }
    response.end(modelResponse(context.operation === 'FIRST_GREETING' ? '动态测试问候' : '重新生成完成'));
  });
  return {
    server,
    delayedStarted,
    providerAborted: () => providerAborted,
  };
}

function startApi(port, providerPort) {
  const work = path.join(tempRoot, 'api');
  fs.mkdirSync(work, { recursive: true });
  const database = path.join(work, 'zhiqu').replaceAll('\\', '/');
  const env = {
    ...process.env,
    SERVER_PORT: String(port),
    DB_URL: `jdbc:h2:file:${database};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1`,
    APP_ALLOWED_ORIGINS: 'http://127.0.0.1:8082,http://localhost:8082',
    APP_JWT_SECRET: 'assistant-cancellation-test-secret-long-enough',
    SPRING_CONFIG_IMPORT: `optional:file:${path.join(work, 'missing.properties').replaceAll('\\', '/')}`,
    DASHSCOPE_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
    DASHSCOPE_API_KEY: 'test-key',
    DASHSCOPE_MODEL: 'test-model',
  };
  const child = spawn('java', ['-jar', jarPath], { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-60_000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-60_000); });
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
  const deadline = Date.now() + 35_000;
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

async function register(baseUrl) {
  const response = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: {
      username: `cancel${randomUUID().replaceAll('-', '').slice(0, 10)}`,
      password: 'SafePass123!',
      nickname: '停止测试',
    },
  });
  assert.equal(response.status, 201);
  return response.payload.accessToken;
}

async function waitUntil(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('condition did not become true');
}

(async () => {
  assert.ok(fs.existsSync(jarPath), 'generated server JAR must exist');
  const provider = startProvider();
  const providerPort = await listen(provider.server);
  const apiPort = await freePort();
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  const api = startApi(apiPort, providerPort);
  try {
    await waitForHealth(baseUrl, api);
    const token = await register(baseUrl);
    const created = await request(baseUrl, '/api/assistant/conversations', {
      method: 'POST', token,
      body: { requestId: randomUUID(), memoryEnabled: false },
    });
    assert.equal(created.status, 201);
    const conversationId = created.payload.conversation.id;
    const requestId = randomUUID();
    const pending = request(baseUrl, `/api/assistant/conversations/${conversationId}/messages`, {
      method: 'POST', token,
      body: { requestId, content: '请生成一段用于取消测试的回答', memoryEnabled: false },
    });
    await Promise.race([
      provider.delayedStarted,
      new Promise((_, reject) => setTimeout(() => reject(new Error('provider request did not start')), 5000)),
    ]);
    const cancelled = await request(baseUrl, `/api/assistant/requests/${requestId}`, { method: 'DELETE', token });
    assert.equal(cancelled.status, 204, 'cancel endpoint must accept the active request');
    const cancelledGeneration = await pending;
    assert.equal(cancelledGeneration.status, 409, 'cancelled generation must end promptly');
    assert.equal(cancelledGeneration.payload.code, 'AI_GENERATION_CANCELLED');
    await waitUntil(provider.providerAborted, 3000);
    assert.equal(provider.providerAborted(), true, 'provider HTTP request must be cancelled');

    const afterCancel = await request(baseUrl, `/api/assistant/conversations/${conversationId}/messages`, { token });
    assert.equal(afterCancel.status, 200);
    assert.equal(afterCancel.payload.filter((message) => message.role === 'USER').length, 1);
    assert.equal(afterCancel.payload.filter((message) => message.role === 'ASSISTANT').length, 1, 'cancelled reply must not be saved');

    const retried = await request(baseUrl, `/api/assistant/conversations/${conversationId}/messages`, {
      method: 'POST', token,
      body: { requestId, content: '请生成一段用于取消测试的回答', memoryEnabled: false },
    });
    assert.equal(retried.status, 200, 'the cancelled request must remain retryable');
    const userMessageId = retried.payload.userMessage.id;
    const assistantMessageId = retried.payload.assistantMessage.id;
    const regenerated = await request(baseUrl, `/api/assistant/conversations/${conversationId}/messages/${userMessageId}`, {
      method: 'PUT', token,
      body: { requestId: randomUUID(), content: retried.payload.userMessage.body, memoryEnabled: false },
    });
    assert.equal(regenerated.status, 200);
    assert.equal(regenerated.payload.userMessage.id, userMessageId, 'regeneration must keep the user message ID');
    assert.equal(regenerated.payload.assistantMessage.id, assistantMessageId, 'regeneration must replace the assistant reply');
    const afterRegenerate = await request(baseUrl, `/api/assistant/conversations/${conversationId}/messages`, { token });
    assert.equal(afterRegenerate.payload.length, 3, 'regeneration must not create duplicate messages');
    console.log(JSON.stringify({ result: 'ok', checks: 15 }));
  } finally {
    await stopApi(api);
    await new Promise((resolve) => provider.server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});
