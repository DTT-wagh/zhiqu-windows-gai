const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const generatedJarPath = path.join(serverRoot, 'generated', 'zhiqu-server.jar');
const jarPath = path.resolve(process.env.ZHIQU_SERVER_JAR || generatedJarPath);
const baselineJarPath = path.join(serverRoot, 'zhiqu-server.jar');
const sourceRoot = path.join(__dirname, 'com', 'zhiqu', 'server', 'hot');
const classDirectory = 'BOOT-INF/classes/com/zhiqu/server/hot';
const learningSourceRoot = path.join(__dirname, 'com', 'zhiqu', 'server', 'learning');
const learningClassDirectory = 'BOOT-INF/classes/com/zhiqu/server/learning';
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-hot-ranking-'));

function run(command, args, cwd) {
  childProcess.execFileSync(command, args, { cwd, stdio: 'inherit', shell: false });
}

try {
  if (jarPath === path.resolve(baselineJarPath)) {
    throw new Error('Refusing to modify immutable baseline JAR; run apply-patches.cjs to assemble server/generated/zhiqu-server.jar');
  }
  if (!fs.existsSync(jarPath)) throw new Error(`Server jar not found: ${jarPath}`);
  const sources = [sourceRoot, learningSourceRoot].flatMap((root) => fs.readdirSync(root)
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(root, name)));
  if (!sources.length) throw new Error(`Hot-ranking Java sources not found: ${sourceRoot}`);

  run('jar', ['xf', jarPath, 'BOOT-INF/classes/', 'BOOT-INF/lib/'], tempRoot);
  run('javac', [
    '-encoding', 'UTF-8',
    '-parameters',
    '-cp', ['BOOT-INF/classes', 'BOOT-INF/lib/*'].join(path.delimiter),
    '-d', 'BOOT-INF/classes',
    ...sources,
  ], tempRoot);

  run('jar', ['uf', jarPath, '-C', tempRoot, classDirectory, '-C', tempRoot, learningClassDirectory], projectRoot);
  console.log('Platform-wide hot-video aggregation endpoint added to the generated server JAR');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
