const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const jarPath = process.env.ZHIQU_SERVER_JAR || path.join(projectRoot, 'server', 'zhiqu-server.jar');
const backupPath = process.env.ZHIQU_SERVER_BACKUP || path.join(projectRoot, 'server', 'zhiqu-server.jar.before-community-body-limit');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiqu-community-body-'));

function runJar(args, cwd) {
  const result = spawnSync('jar', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`jar ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
}

function replaceUnique(buffer, oldBytes, newBytes, label) {
  const positions = [];
  let offset = 0;
  while (offset <= buffer.length - oldBytes.length) {
    const position = buffer.indexOf(oldBytes, offset);
    if (position < 0) break;
    positions.push(position);
    offset = position + oldBytes.length;
  }
  if (positions.length !== 1) {
    throw new Error(`${label}: expected one match, found ${positions.length}`);
  }
  return Buffer.concat([buffer.subarray(0, positions[0]), newBytes, buffer.subarray(positions[0] + oldBytes.length)]);
}

function patchClass(relativePath, patches) {
  const filePath = path.join(tempRoot, relativePath);
  let buffer = fs.readFileSync(filePath);
  for (const patch of patches) {
    buffer = replaceUnique(buffer, patch.oldBytes, patch.newBytes, `${relativePath} ${patch.label}`);
  }
  fs.writeFileSync(filePath, buffer);
}

try {
  if (process.env.ZHIQU_CREATE_BACKUP !== '0' && !fs.existsSync(backupPath)) {
    fs.copyFileSync(jarPath, backupPath, fs.constants.COPYFILE_EXCL);
  }

  const communityClasses = 'BOOT-INF/classes/com/zhiqu/server/community';
  const migrationPath = 'BOOT-INF/classes/db/migration/V37__expand_community_question_body.sql';
  runJar(['xf', jarPath, communityClasses], tempRoot);

  const oldLimit = Buffer.from([0x03, 0x00, 0x00, 0x03, 0xe8]);
  const newLimit = Buffer.from([0x03, 0x00, 0x00, 0x0b, 0xb8]);
  const oldMessage = Buffer.from('正文不能超过1000字', 'utf8');
  const newMessage = Buffer.from('正文不能超过3000字', 'utf8');
  for (const className of ['CommunityDtos$CreateQuestionRequest.class', 'CommunityDtos$EditQuestionRequest.class']) {
    patchClass(path.join(communityClasses, className), [
      { label: 'validation limit', oldBytes: oldLimit, newBytes: newLimit },
      { label: 'validation message', oldBytes: oldMessage, newBytes: newMessage },
    ]);
  }

  const servicePath = path.join(communityClasses, 'CommunityService.class');
  let service = fs.readFileSync(path.join(tempRoot, servicePath));
  service = replaceUnique(service, Buffer.from('正文需为20-1000字', 'utf8'), Buffer.from('正文需为20-3000字', 'utf8'), 'CommunityService message');
  service = replaceUnique(
    service,
    Buffer.from([0x11, 0x03, 0xe8, 0x13, 0x03, 0xa3]),
    Buffer.from([0x11, 0x0b, 0xb8, 0x13, 0x03, 0xa3]),
    'CommunityService body limit',
  );
  fs.writeFileSync(path.join(tempRoot, servicePath), service);

  const migrationFile = path.join(tempRoot, migrationPath);
  fs.mkdirSync(path.dirname(migrationFile), { recursive: true });
  fs.writeFileSync(migrationFile, 'ALTER TABLE community_question_revisions ALTER COLUMN body VARCHAR(3000);\n', 'utf8');

  runJar(['uf', jarPath, '-C', tempRoot, path.join(communityClasses, 'CommunityDtos$CreateQuestionRequest.class'), '-C', tempRoot, path.join(communityClasses, 'CommunityDtos$EditQuestionRequest.class'), '-C', tempRoot, path.join(communityClasses, 'CommunityService.class'), '-C', tempRoot, migrationPath], projectRoot);
  console.log('Patched question body validation and migration to 3000 characters.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
