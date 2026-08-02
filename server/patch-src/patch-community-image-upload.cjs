const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const jarPath = path.join(projectRoot, 'server', 'zhiqu-server.jar');
const sourcePath = path.join(__dirname, 'com', 'zhiqu', 'server', 'community', 'CommunityImageController.java');
const classPath = 'BOOT-INF/classes/com/zhiqu/server/community/CommunityImageController.class';
// Keep compiler inputs inside the workspace. On this Windows setup javac cannot
// reliably reopen JAR files created below the system temporary directory.
const tempRoot = fs.mkdtempSync(path.join(projectRoot, 'server', '.patch-community-images-'));
const dependencies = [
  'BOOT-INF/lib/spring-core-7.0.8.jar',
  'BOOT-INF/lib/commons-logging-1.3.6.jar',
  'BOOT-INF/lib/spring-beans-7.0.8.jar',
  'BOOT-INF/lib/spring-context-7.0.8.jar',
  'BOOT-INF/lib/spring-expression-7.0.8.jar',
  'BOOT-INF/lib/spring-web-7.0.8.jar',
  'BOOT-INF/lib/spring-webmvc-7.0.8.jar',
  'BOOT-INF/lib/spring-security-core-7.1.0.jar',
  'BOOT-INF/lib/jakarta.servlet-api-6.1.0.jar',
  'BOOT-INF/lib/jakarta.annotation-api-3.0.0.jar',
];

function run(command, args, cwd) {
  childProcess.execFileSync(command, args, { cwd, stdio: 'inherit', shell: false });
}

try {
  if (!fs.existsSync(jarPath)) throw new Error(`Server jar not found: ${jarPath}`);
  run('jar', [
    'xf',
    jarPath,
    'BOOT-INF/classes/com/zhiqu/server/config/MediaProperties.class',
    ...dependencies,
  ], tempRoot);
  run('javac', [
    '-encoding', 'UTF-8',
    '-cp', ['BOOT-INF/classes', ...dependencies].join(path.delimiter),
    '-d', 'BOOT-INF/classes',
    sourcePath,
  ], tempRoot);
  run('jar', ['uf', jarPath, '-C', tempRoot, classPath], projectRoot);
  console.log('Community image upload endpoint added to server/zhiqu-server.jar');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
