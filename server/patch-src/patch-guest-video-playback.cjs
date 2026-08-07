const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const jarPath = process.env.ZHIQU_SERVER_JAR || path.join(serverRoot, 'zhiqu-server.jar');
const securitySourcePath = path.join(__dirname, 'com', 'zhiqu', 'server', 'config', 'SecurityConfig.java');
const controllerSourcePath = path.join(__dirname, 'com', 'zhiqu', 'server', 'content', 'ContentController.java');
const securityClassPath = 'BOOT-INF/classes/com/zhiqu/server/config/SecurityConfig.class';
const controllerClassPath = 'BOOT-INF/classes/com/zhiqu/server/content/ContentController.class';
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-guest-video-playback-'));
const dependencies = [
  'BOOT-INF/classes/com/zhiqu/server/config/',
  'BOOT-INF/classes/com/zhiqu/server/content/',
  'BOOT-INF/classes/com/zhiqu/server/reward/',
  'BOOT-INF/classes/com/zhiqu/server/common/',
  'BOOT-INF/lib/',
];

function run(command, args, cwd) {
  childProcess.execFileSync(command, args, { cwd, stdio: 'inherit', shell: false });
}

try {
  if (!fs.existsSync(jarPath)) throw new Error(`Server jar not found: ${jarPath}`);
  run('jar', ['xf', jarPath, ...dependencies], tempRoot);
  run('javac', [
    '-encoding', 'UTF-8',
    '-cp', ['BOOT-INF/classes', 'BOOT-INF/lib/*'].join(path.delimiter),
    '-d', 'BOOT-INF/classes',
    '-parameters',
    securitySourcePath,
    controllerSourcePath,
  ], tempRoot);
  run('jar', [
    'uf', jarPath,
    '-C', tempRoot, securityClassPath,
    '-C', tempRoot, controllerClassPath,
  ], projectRoot);
  console.log('Guest video playback access and anonymous controller handling added to the generated server JAR');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
