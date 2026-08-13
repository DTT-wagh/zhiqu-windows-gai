const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const generatedJarPath = path.join(serverRoot, 'generated', 'zhiqu-server.jar');
const jarPath = path.resolve(process.env.ZHIQU_SERVER_JAR || generatedJarPath);
const baselineJarPath = path.join(serverRoot, 'zhiqu-server.jar');
const sourceRoot = path.join(__dirname, 'com', 'zhiqu', 'server', 'singleplayer');
const securitySource = path.join(__dirname, 'com', 'zhiqu', 'server', 'config', 'SecurityConfig.java');
const migrations = [
  {
    source: path.join(__dirname, 'db', 'migration', 'V43__create_single_player_games.sql'),
    target: 'BOOT-INF/classes/db/migration/V43__create_single_player_games.sql',
  },
  {
    source: path.join(__dirname, 'db', 'migration', 'V45__create_prompt_question_bank.sql'),
    target: 'BOOT-INF/classes/db/migration/V45__create_prompt_question_bank.sql',
  },
];
const classDirectory = 'BOOT-INF/classes/com/zhiqu/server/singleplayer';
const securityClass = 'BOOT-INF/classes/com/zhiqu/server/config/SecurityConfig.class';
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-single-player-games-'));

function run(command, args, cwd) {
  childProcess.execFileSync(command, args, { cwd, stdio: 'inherit', shell: false });
}

try {
  if (jarPath === path.resolve(baselineJarPath)) {
    throw new Error('Refusing to modify immutable baseline JAR; run apply-patches.cjs to assemble server/generated/zhiqu-server.jar');
  }
  if (!fs.existsSync(jarPath)) throw new Error(`Server jar not found: ${jarPath}`);
  for (const migration of migrations) {
    if (!fs.existsSync(migration.source)) throw new Error(`Migration not found: ${migration.source}`);
  }
  const sources = fs.readdirSync(sourceRoot)
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(sourceRoot, name));
  if (!sources.length) throw new Error(`Single-player Java sources not found: ${sourceRoot}`);

  run('jar', [
    'xf', jarPath,
    'BOOT-INF/classes/com/zhiqu/server/config/',
    'BOOT-INF/classes/com/zhiqu/server/common/',
    'BOOT-INF/classes/com/zhiqu/server/reward/',
    'BOOT-INF/classes/com/zhiqu/server/game/',
    'BOOT-INF/lib/',
  ], tempRoot);
  run('javac', [
    '-encoding', 'UTF-8',
    '-parameters',
    '-cp', ['BOOT-INF/classes', 'BOOT-INF/lib/*'].join(path.delimiter),
    '-d', 'BOOT-INF/classes',
    securitySource,
    ...sources,
  ], tempRoot);

  for (const migration of migrations) {
    const migrationTarget = path.join(tempRoot, migration.target);
    fs.mkdirSync(path.dirname(migrationTarget), { recursive: true });
    fs.copyFileSync(migration.source, migrationTarget);
  }

  const jarArgs = [
    'uf', jarPath,
    '-C', tempRoot, classDirectory,
    '-C', tempRoot, securityClass,
  ];
  for (const migration of migrations) jarArgs.push('-C', tempRoot, migration.target);
  run('jar', jarArgs, projectRoot);
  console.log('Single-player games, V43/V45 schemas, prompt bank, and generated media reads added to the generated server JAR');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
