CREATE TABLE assistant_conversations (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(80) NOT NULL,
    summary VARCHAR(2000),
    memory_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    deleted_at TIMESTAMP(6),
    CONSTRAINT fk_assistant_conversation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_assistant_conversation_user
    ON assistant_conversations(user_id, deleted_at, updated_at);

CREATE TABLE assistant_messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    author_user_id VARCHAR(36),
    role VARCHAR(16) NOT NULL,
    body TEXT NOT NULL,
    intent VARCHAR(24),
    sources_json TEXT,
    recommendations_json TEXT,
    safety_status VARCHAR(16) NOT NULL,
    safety_reason VARCHAR(300),
    request_id VARCHAR(36),
    reply_to_message_id VARCHAR(36),
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_assistant_message_conversation FOREIGN KEY (conversation_id) REFERENCES assistant_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_message_author FOREIGN KEY (author_user_id) REFERENCES users(id),
    CONSTRAINT fk_assistant_message_reply FOREIGN KEY (reply_to_message_id) REFERENCES assistant_messages(id),
    CONSTRAINT chk_assistant_message_role CHECK (role IN ('USER', 'ASSISTANT')),
    CONSTRAINT chk_assistant_message_safety CHECK (safety_status IN ('SAFE', 'BLOCKED', 'REVIEW', 'NOT_CHECKED')),
    CONSTRAINT uk_assistant_message_request UNIQUE (request_id)
);

CREATE INDEX idx_assistant_message_conversation
    ON assistant_messages(conversation_id, created_at, id);

CREATE UNIQUE INDEX uk_assistant_message_reply
    ON assistant_messages(reply_to_message_id);

CREATE TABLE assistant_memory (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    memory_key VARCHAR(60) NOT NULL,
    content VARCHAR(2000) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    consented_at TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_assistant_memory_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_assistant_memory_user_key UNIQUE (user_id, memory_key)
);

CREATE INDEX idx_assistant_memory_user
    ON assistant_memory(user_id, enabled, updated_at);

CREATE TABLE assistant_recommendation_events (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    conversation_id VARCHAR(36),
    message_id VARCHAR(36),
    content_id VARCHAR(36),
    event_type VARCHAR(32) NOT NULL,
    helpful BOOLEAN,
    metadata_json VARCHAR(1000),
    request_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_assistant_event_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_event_conversation FOREIGN KEY (conversation_id) REFERENCES assistant_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_event_message FOREIGN KEY (message_id) REFERENCES assistant_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_event_content FOREIGN KEY (content_id) REFERENCES contents(id),
    CONSTRAINT uk_assistant_event_request UNIQUE (request_id),
    CONSTRAINT chk_assistant_event_type CHECK (event_type IN ('HELPFUL', 'NOT_HELPFUL', 'RECOMMENDATION_OPEN'))
);

CREATE INDEX idx_assistant_event_user
    ON assistant_recommendation_events(user_id, created_at);

CREATE INDEX idx_assistant_event_content
    ON assistant_recommendation_events(content_id, event_type, created_at);
