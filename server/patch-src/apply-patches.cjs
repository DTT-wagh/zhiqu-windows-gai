const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const manifestPath = path.join(__dirname, 'patch-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const baselinePath = path.resolve(projectRoot, manifest.baselineJar);
const outputPath = path.resolve(process.env.ZHIQU_SERVER_OUTPUT || path.join(serverRoot, 'generated', 'zhiqu-server.jar'));

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function fail(message) {
  throw new Error(`[patch-manifest] ${message}`);
}

if (!fs.existsSync(baselinePath)) fail(`baseline JAR not found: ${baselinePath}`);
const actualHash = sha256(baselinePath);
if (actualHash !== String(manifest.baselineSha256).toUpperCase()) {
  fail(`baseline SHA-256 mismatch; expected ${manifest.baselineSha256}, got ${actualHash}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.copyFileSync(baselinePath, outputPath);

for (const patch of manifest.patches || []) {
  if (!patch || typeof patch.script !== 'string' || !patch.script.endsWith('.cjs')) {
    fail('every registered patch must provide a .cjs script path');
  }
  const scriptPath = path.resolve(projectRoot, patch.script);
  if (!scriptPath.startsWith(projectRoot) || !fs.existsSync(scriptPath)) {
    fail(`patch script not found inside project: ${patch.script}`);
  }
  const result = childProcess.spawnSync(process.execPath, [scriptPath], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ZHIQU_SERVER_JAR: outputPath,
      ZHIQU_CREATE_BACKUP: '0',
    },
    stdio: 'inherit',
  });
  if (result.status !== 0) fail(`patch failed: ${patch.name || patch.script}`);
}

console.log(`Server assembled at ${path.relative(projectRoot, outputPath)} from ${manifest.patches?.length || 0} registered patch(es).`);
