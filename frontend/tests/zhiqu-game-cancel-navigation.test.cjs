const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const frontendRoot = path.resolve(__dirname, '..');
const bundlePath = path.join(frontendRoot, 'dist', '_expo', 'static', 'js', 'web');
const bundleName = fs.readdirSync(bundlePath).find((name) => /^entry-.*\.js$/.test(name));
const port = 18000 + Math.floor(Math.random() * 1000);

assert.ok(bundleName, 'the Expo web entry bundle must exist');

function requestBundle() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/_expo/static/js/web/${bundleName}`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await requestBundle();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

(async () => {
  const child = spawn(process.execPath, ['serve-static.cjs'], {
    cwd: frontendRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const response = await waitForServer();
    assert.equal(response.status, 200, 'the transformed Expo bundle must be served');

    const expectedCallbacks = [
      'M=e=>{w(e),globalThis.location.replace("/community?section=games")}',
      'onSuccess:e=>{me(e),globalThis.location.replace("/community?section=games")}',
      'me=e=>{ce(h,c,e),globalThis.location.replace("/community?section=games")}',
      'rt=e=>{pe(e),globalThis.location.replace("/community?section=games")}',
    ];
    for (const callback of expectedCallbacks) {
      assert.ok(response.body.includes(callback), `served bundle must contain ${callback}`);
    }

    const oldCallbacks = [
      'M=e=>{w(e),n.router.replace("/blind-box")}',
      'onSuccess:e=>{me(e),n.router.replace("/jailbreak-game")}',
      'me=e=>{ce(h,c,e),l.router.replace("/magic")}',
      'rt=e=>{pe(e),l.router.replace("/truth-game")}',
    ];
    for (const callback of oldCallbacks) {
      assert.equal(response.body.includes(callback), false, `served bundle must remove ${callback}`);
    }

    console.log(JSON.stringify({ result: 'ok', games: 4, target: '/community?section=games' }));
  } finally {
    child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
