const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..');
const jarPath = path.resolve(process.env.ZHIQU_SERVER_JAR || path.join(serverRoot, 'generated', 'zhiqu-server.jar'));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'patch-manifest.json'), 'utf8'));
const imageSource = fs.readFileSync(path.join(__dirname, 'com', 'zhiqu', 'server', 'magic', 'MagicImageApi.java'), 'utf8');
const progressSource = fs.readFileSync(path.join(__dirname, 'com', 'zhiqu', 'server', 'magic', 'MagicImageProgress.java'), 'utf8');
const progressControllerSource = fs.readFileSync(path.join(__dirname, 'com', 'zhiqu', 'server', 'magic', 'MagicImageProgressController.java'), 'utf8');
const generationServiceSource = fs.readFileSync(path.join(__dirname, 'com', 'zhiqu', 'server', 'magic', 'MagicImageGenerationService.java'), 'utf8');

assert.ok(manifest.patches.some((patch) => patch.script === 'server/patch-src/patch-magic-image-generation.cjs'), 'image generation patch must be part of every server assembly');
assert.match(imageSource, /MagicImageApi[\s\S]*generate\(String roomId, List<String> terms\)/, 'the real provider adapter must remain available');
assert.doesNotMatch(imageSource, /pollinations\.ai/, 'the provider adapter must not return the legacy placeholder URL');
assert.match(imageSource, /PROVIDER_ATTEMPTS\s*=\s*2/, 'transient provider failures must receive one bounded retry');
assert.match(imageSource, /IMAGE_TIMEOUT\s*=\s*Duration\.ofSeconds\(150\)/, 'each provider attempt must have a bounded timeout');
assert.match(imageSource, /future\.cancel\(true\)/, 'timed out provider work must be cancelled');
assert.match(imageSource, /retryableStatus\(response\.statusCode\(\)\)/, 'only retryable provider statuses may trigger another generation attempt');
assert.match(imageSource, /"RETRYING",\s*32/, 'an automatic retry must be visible through the progress endpoint');
assert.match(imageSource, /size.*512x512/, 'the provider request must use the proven low-latency mobile game size');
assert.match(imageSource, /Magic image provider completed room/, 'provider latency must be recorded for successful requests');
assert.match(imageSource, /Magic image provider connection failed/, 'provider timeout diagnostics must include attempt latency');
assert.match(imageSource, /MAGIC_IMAGE_PROXY_URL/, 'the provider client must support an explicit proxy for restricted networks');
assert.match(imageSource, /ProxySelector\.of\(new InetSocketAddress/, 'the configured image proxy must be applied to Java HttpClient');
assert.match(imageSource, /requestImage\(http, roomId, request\)/, 'image generation must use the configured provider client');
assert.match(imageSource, /storeRemoteImage\(http, config, roomId, remoteUrl\)/, 'remote image downloads must use the same configured provider client');
assert.match(imageSource, /storeRemoteImage\(http, config, roomId, remoteUrl\)/, 'remote generated images must be copied to stable local media before returning to the game');
assert.match(imageSource, /TERM_GROUPS/, 'the image provider must preserve the server-approved term groups');
assert.match(imageSource, /第" \+ \(index \+ 1\) \+ "类提示词不正确/, 'a cross-category prompt must return a recoverable validation message');
assert.match(imageSource, /MAGIC_IMAGE_UNAVAILABLE/, 'provider failures must be returned as an actionable game error');
assert.match(imageSource, /图片服务响应超时，请稍后重试/, 'provider timeouts must not become a generic internal error');
for (const [status, progress] of [['PREPARING', 8], ['REQUESTING', 25], ['RECEIVING', 65], ['SAVING', 92]]) {
  assert.match(imageSource, new RegExp(`"${status}",\\s*${progress}`), `provider stage ${status} must report ${progress} percent`);
}
assert.match(progressSource, /"IMAGE_READY",\s*98/, 'the backend must stop at 98 percent until the browser loads the generated image');
assert.match(progressSource, /"FAILED",\s*progress/, 'a failed generation must preserve its last real percentage instead of showing completion');
assert.match(progressControllerSource, /@GetMapping\("\/\{roomId\}\/image-progress"\)/, 'room generation progress must have a query endpoint');
assert.equal((progressControllerSource.match(/@PathVariable\("roomId"\)/g) || []).length, 2, 'patched controllers must bind roomId explicitly when javac does not retain parameter names');
assert.match(progressControllerSource, /magicGames\.get\(authentication\.getName\(\), roomId\)/, 'only a room member may read image progress using the service user-room argument order');
assert.match(progressControllerSource, /@PostMapping\("\/\{roomId\}\/mentor-cast-async"\)/, 'creator image generation must expose a non-blocking submission endpoint');
assert.match(progressControllerSource, /ResponseEntity\.accepted\(\)/, 'background generation submission must return 202 Accepted immediately');
assert.match(generationServiceSource, /jobs\.putIfAbsent\(roomId, job\)/, 'the same room must not start concurrent provider jobs');
assert.match(generationServiceSource, /magicGames\.get\(username, roomId\)/, 'generation validation must use the service user-room argument order');
assert.match(generationServiceSource, /executor\.execute\(\(\) -> generate/, 'the real room cast must run outside the HTTP request thread');
assert.match(generationServiceSource, /magicGames\.castMentor\(username, roomId, request\)/, 'the background task must preserve the real room state transition');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zq-magic-image-test-'));
try {
  childProcess.execFileSync('jar', ['xf', jarPath,
    'BOOT-INF/classes/com/zhiqu/server/magic/MagicGameService.class',
    'BOOT-INF/classes/com/zhiqu/server/magic/MagicImageProgress.class',
    'BOOT-INF/classes/com/zhiqu/server/magic/MagicImageProgressController.class',
    'BOOT-INF/classes/com/zhiqu/server/magic/MagicImageGenerationService.class',
  ], { cwd: tempRoot });
  const classPath = path.join(tempRoot, 'BOOT-INF', 'classes', 'com', 'zhiqu', 'server', 'magic', 'MagicGameService.class');
  const bytecode = childProcess.execFileSync('javap', ['-p', '-c', classPath], { encoding: 'utf8' });
  const noviceStart = bytecode.indexOf('public com.zhiqu.server.magic.MagicGameDtos$MagicGameSnapshot castNovice');
  const noviceEnd = bytecode.indexOf('\n  public ', noviceStart + 1);
  const noviceCast = bytecode.slice(noviceStart, noviceEnd === -1 ? bytecode.length : noviceEnd);
  const leaveStart = bytecode.indexOf('public void leave');
  const leaveEnd = bytecode.indexOf('\n  public ', leaveStart + 1);
  const leaveRoom = bytecode.slice(leaveStart, leaveEnd === -1 ? bytecode.length : leaveEnd);
  assert.match(bytecode, /MagicImageApi\.generate/, 'assembled MagicGameService must call the real image provider adapter');
  assert.match(bytecode, /castMentor[\s\S]*MagicImageApi\.generate[\s\S]*lockedRoom/, 'mentor image generation must finish before the room row is locked');
  assert.ok(noviceStart >= 0, 'assembled MagicGameService must contain novice answer submission');
  assert.doesNotMatch(noviceCast, /MagicImageApi\.generate/, 'answer submission must not wait for a second external image generation job');
  assert.match(noviceCast, /MagicGameRoomEntity\.castNovice/, 'answer submission must still complete the room with the entity result transition');
  assert.ok(leaveStart >= 0, 'assembled MagicGameService must contain the room leave flow');
  assert.match(leaveRoom, /GameRoomLifecycleCoordinator\.closed/, 'leaving a matched public room must close its listing');
  assert.doesNotMatch(leaveRoom, /GameRoomLifecycleCoordinator\.left/, 'leaving must not reopen the old public listing as a new 1\/2 room');
  assert.ok(fs.existsSync(path.join(tempRoot, 'BOOT-INF', 'classes', 'com', 'zhiqu', 'server', 'magic', 'MagicImageProgress.class')), 'assembled server must include the progress registry');
  assert.ok(fs.existsSync(path.join(tempRoot, 'BOOT-INF', 'classes', 'com', 'zhiqu', 'server', 'magic', 'MagicImageProgressController.class')), 'assembled server must include the progress endpoint');
  assert.ok(fs.existsSync(path.join(tempRoot, 'BOOT-INF', 'classes', 'com', 'zhiqu', 'server', 'magic', 'MagicImageGenerationService.class')), 'assembled server must include the asynchronous generation service');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

console.log('Magic image patch: ok');
