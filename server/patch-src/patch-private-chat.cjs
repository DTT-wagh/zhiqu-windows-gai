const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'server');
const jarPath = process.env.ZHIQU_SERVER_JAR || path.join(serverRoot, 'zhiqu-server.jar');
const sourcePath = path.join(__dirname, 'com', 'zhiqu', 'server', 'chat', 'PrivateChatController.java');
const stickerSourcePath = path.join(__dirname, 'com', 'zhiqu', 'server', 'chat', 'ChatStickerController.java');
const classPath = 'BOOT-INF/classes/com/zhiqu/server/chat/PrivateChatController.class';
const requestClassPath = 'BOOT-INF/classes/com/zhiqu/server/chat/PrivateChatController$SendMessageRequest.class';
const stickerClassPath = 'BOOT-INF/classes/com/zhiqu/server/chat/ChatStickerController.class';
const stickerRequestClassPath = 'BOOT-INF/classes/com/zhiqu/server/chat/ChatStickerController$AddStickerRequest.class';
const migrationPath = 'BOOT-INF/classes/db/migration/V38__create_private_chat.sql';
const statusMigrationPath = 'BOOT-INF/classes/db/migration/V39__add_chat_request_status.sql';
const stickerMigrationPath = 'BOOT-INF/classes/db/migration/V40__create_chat_stickers.sql';
const tempRoot = fs.mkdtempSync(path.join(serverRoot, '.patch-private-chat-'));

function run(command, args, cwd) {
  childProcess.execFileSync(command, args, { cwd, stdio: 'inherit', shell: false });
}

try {
  run('jar', [
    'xf', jarPath,
    'BOOT-INF/classes/com/zhiqu/server/social/',
    'BOOT-INF/classes/com/zhiqu/server/auth/',
    'BOOT-INF/classes/com/zhiqu/server/common/',
    'BOOT-INF/classes/com/zhiqu/server/config/',
    'BOOT-INF/lib/',
  ], tempRoot);
  run('javac', [
    '-encoding', 'UTF-8',
    '-cp', ['BOOT-INF/classes', 'BOOT-INF/lib/*'].join(path.delimiter),
    '-d', 'BOOT-INF/classes',
    sourcePath,
    stickerSourcePath,
  ], tempRoot);

  const migrationFile = path.join(tempRoot, migrationPath);
  fs.mkdirSync(path.dirname(migrationFile), { recursive: true });
  fs.writeFileSync(migrationFile, `
CREATE TABLE chat_conversations (
  id VARCHAR(36) PRIMARY KEY,
  user_low_id VARCHAR(36) NOT NULL,
  user_high_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL,
  CONSTRAINT uk_chat_conversation_pair UNIQUE (user_low_id, user_high_id),
  CONSTRAINT fk_chat_conversation_low FOREIGN KEY (user_low_id) REFERENCES users(id),
  CONSTRAINT fk_chat_conversation_high FOREIGN KEY (user_high_id) REFERENCES users(id),
  CONSTRAINT chk_chat_conversation_pair CHECK (user_low_id <> user_high_id)
);

CREATE TABLE chat_messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL,
  sender_id VARCHAR(36) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL,
  read_at TIMESTAMP(6),
  CONSTRAINT fk_chat_message_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_message_sender FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE INDEX idx_chat_conversation_low ON chat_conversations(user_low_id, updated_at);
CREATE INDEX idx_chat_conversation_high ON chat_conversations(user_high_id, updated_at);
CREATE INDEX idx_chat_message_conversation ON chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_message_unread ON chat_messages(conversation_id, sender_id, read_at);
`, 'utf8');

  const statusMigrationFile = path.join(tempRoot, statusMigrationPath);
  fs.mkdirSync(path.dirname(statusMigrationFile), { recursive: true });
  fs.writeFileSync(statusMigrationFile, `
ALTER TABLE chat_conversations
  ADD COLUMN status VARCHAR(16) DEFAULT 'ACCEPTED' NOT NULL;

ALTER TABLE chat_conversations
  ADD COLUMN requested_by_id VARCHAR(36);

ALTER TABLE chat_conversations
  ADD CONSTRAINT fk_chat_conversation_requested_by
  FOREIGN KEY (requested_by_id) REFERENCES users(id);

ALTER TABLE chat_conversations
  ADD CONSTRAINT chk_chat_conversation_status
  CHECK (status IN ('REQUESTED', 'ACCEPTED', 'DECLINED'));

CREATE INDEX idx_chat_conversation_status ON chat_conversations(status, updated_at);
`, 'utf8');

  const stickerMigrationFile = path.join(tempRoot, stickerMigrationPath);
  fs.mkdirSync(path.dirname(stickerMigrationFile), { recursive: true });
  fs.writeFileSync(stickerMigrationFile, `
CREATE TABLE chat_stickers (
  id VARCHAR(36) PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  storage_key VARCHAR(80) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL,
  CONSTRAINT fk_chat_sticker_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uk_chat_sticker_owner_key UNIQUE (owner_id, storage_key)
);

CREATE INDEX idx_chat_sticker_owner_created ON chat_stickers(owner_id, created_at);
`, 'utf8');

  run('jar', [
    'uf', jarPath,
    '-C', tempRoot, classPath,
    '-C', tempRoot, requestClassPath,
    '-C', tempRoot, stickerClassPath,
    '-C', tempRoot, stickerRequestClassPath,
    '-C', tempRoot, migrationPath,
    '-C', tempRoot, statusMigrationPath,
    '-C', tempRoot, stickerMigrationPath,
  ], projectRoot);
  console.log('Private chat endpoints and schema added to the generated server jar.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
