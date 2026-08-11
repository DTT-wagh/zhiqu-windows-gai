const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const generatedJarPath = path.join(serverRoot, 'generated', 'zhiqu-server.jar');
const jarPath = path.resolve(process.env.ZHIQU_SERVER_JAR || generatedJarPath);
const baselineJarPath = path.join(serverRoot, 'zhiqu-server.jar');
const sourceRoot = path.join(__dirname, 'com', 'zhiqu', 'server', 'magic');
const migrationSource = path.join(__dirname, 'db', 'migration', 'V44__add_magic_friend_presence.sql');
const migrationPath = 'BOOT-INF/classes/db/migration/V44__add_magic_friend_presence.sql';
const classDirectory = 'BOOT-INF/classes/com/zhiqu/server/magic';
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-magic-friends-'));

function run(command, args, cwd) {
  childProcess.execFileSync(command, args, { cwd, stdio: 'inherit', shell: false });
}

try {
  if (jarPath === path.resolve(baselineJarPath)) {
    throw new Error('Refusing to modify immutable baseline JAR; run apply-patches.cjs to assemble server/generated/zhiqu-server.jar');
  }
  if (!fs.existsSync(jarPath)) throw new Error(`Server jar not found: ${jarPath}`);
  if (!fs.existsSync(migrationSource)) throw new Error(`Migration not found: ${migrationSource}`);
  const sources = fs.readdirSync(sourceRoot)
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(sourceRoot, name));
  if (!sources.length) throw new Error(`Magic Java sources not found: ${sourceRoot}`);

  run('jar', ['xf', jarPath, 'BOOT-INF/classes/', 'BOOT-INF/lib/'], tempRoot);
  run('javac', [
    '-encoding', 'UTF-8',
    '-parameters',
    '-cp', ['BOOT-INF/classes', 'BOOT-INF/lib/*'].join(path.delimiter),
    '-d', 'BOOT-INF/classes',
    ...sources,
  ], tempRoot);

  const migrationTarget = path.join(tempRoot, migrationPath);
  fs.mkdirSync(path.dirname(migrationTarget), { recursive: true });
  fs.copyFileSync(migrationSource, migrationTarget);
  run('jar', ['uf', jarPath, '-C', tempRoot, classDirectory, '-C', tempRoot, migrationPath], projectRoot);
  console.log('Magic friend presence API and V44 schema added to the generated server JAR');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
