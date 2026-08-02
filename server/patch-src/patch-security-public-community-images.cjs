const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const jarPath = process.env.ZHIQU_SERVER_JAR || path.join(serverRoot, 'zhiqu-server.jar');
const sourcePath = path.join(__dirname, 'com', 'zhiqu', 'server', 'config', 'SecurityConfig.java');
const classPath = 'BOOT-INF/classes/com/zhiqu/server/config/SecurityConfig.class';
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-community-image-security-'));
const dependencies = [
  'BOOT-INF/classes/com/zhiqu/server/config/JwtAuthenticationFilter.class',
  'BOOT-INF/classes/com/zhiqu/server/config/SecurityProperties.class',
  'BOOT-INF/classes/com/zhiqu/server/config/AiProperties.class',
  'BOOT-INF/classes/com/zhiqu/server/config/DeepSeekProperties.class',
  'BOOT-INF/classes/com/zhiqu/server/config/MediaProperties.class',
  'BOOT-INF/classes/com/zhiqu/server/config/ContentImportProperties.class',
  'BOOT-INF/classes/com/zhiqu/server/config/TencentVodProperties.class',
  'BOOT-INF/classes/com/zhiqu/server/common/ApiError.class',
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
    sourcePath,
  ], tempRoot);
  run('jar', ['uf', jarPath, '-C', tempRoot, classPath], projectRoot);
  console.log('Public community image reads added to server/zhiqu-server.jar');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
