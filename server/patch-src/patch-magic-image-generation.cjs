const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const generatedJarPath = path.join(serverRoot, 'generated', 'zhiqu-server.jar');
const jarPath = path.resolve(process.env.ZHIQU_SERVER_JAR || generatedJarPath);
const baselineJarPath = path.join(serverRoot, 'zhiqu-server.jar');
const imageSource = path.join(__dirname, 'com', 'zhiqu', 'server', 'magic', 'MagicImageApi.java');
const progressSource = path.join(__dirname, 'com', 'zhiqu', 'server', 'magic', 'MagicImageProgress.java');
const progressControllerSource = path.join(__dirname, 'com', 'zhiqu', 'server', 'magic', 'MagicImageProgressController.java');
const generationServiceSource = path.join(__dirname, 'com', 'zhiqu', 'server', 'magic', 'MagicImageGenerationService.java');
const patchSource = path.join(__dirname, 'PatchMagicGameService.java');
const serviceClass = 'BOOT-INF/classes/com/zhiqu/server/magic/MagicGameService.class';
const magicClassDirectory = 'BOOT-INF/classes/com/zhiqu/server/magic';
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-magic-image-'));

function run(command, args, cwd) {
  childProcess.execFileSync(command, args, { cwd, stdio: 'inherit', shell: false });
}

try {
  if (jarPath === path.resolve(baselineJarPath)) {
    throw new Error('Refusing to modify immutable baseline JAR; run apply-patches.cjs to assemble server/generated/zhiqu-server.jar');
  }
  if (!fs.existsSync(jarPath)) throw new Error(`Server jar not found: ${jarPath}`);
  if (!fs.existsSync(imageSource) || !fs.existsSync(progressSource) || !fs.existsSync(progressControllerSource) || !fs.existsSync(generationServiceSource) || !fs.existsSync(patchSource)) throw new Error('Magic image patch sources are missing');

  run('jar', [
    'xf', jarPath,
    magicClassDirectory + '/',
    'BOOT-INF/classes/com/zhiqu/server/common/',
    'BOOT-INF/lib/',
  ], tempRoot);
  run('javac', [
    '-encoding', 'UTF-8',
    '-cp', ['BOOT-INF/classes', 'BOOT-INF/lib/*'].join(path.delimiter),
    '-d', 'BOOT-INF/classes',
    imageSource,
    progressSource,
    generationServiceSource,
    progressControllerSource,
  ], tempRoot);
  run('javac', [
    '--add-exports', 'java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED',
    '-encoding', 'UTF-8',
    '-d', 'patcher',
    patchSource,
  ], tempRoot);
  run('java', [
    '--add-exports', 'java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED',
    '-cp', 'patcher',
    'PatchMagicGameService',
    serviceClass,
    serviceClass,
  ], tempRoot);
  run('jar', ['uf', jarPath, '-C', tempRoot, magicClassDirectory], projectRoot);
  console.log('Magic game image generation now uses the configured image provider');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
