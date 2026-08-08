const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const source = path.join(__dirname, 'com', 'zhiqu', 'server', 'singleplayer', 'RouteSolver.java');
const testSource = path.join(__dirname, 'test-src', 'com', 'zhiqu', 'server', 'singleplayer', 'RouteSolverTestMain.java');
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-route-solver-test-'));

function run(command, args) {
  childProcess.execFileSync(command, args, { cwd: tempRoot, stdio: 'inherit', shell: false });
}

try {
  run('javac', ['-encoding', 'UTF-8', '-d', tempRoot, source, testSource]);
  run('java', ['-cp', tempRoot, 'com.zhiqu.server.singleplayer.RouteSolverTestMain']);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
