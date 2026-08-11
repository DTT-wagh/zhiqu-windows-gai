CREATE TABLE magic_friend_presence (
    user_id VARCHAR(36) PRIMARY KEY,
    last_seen_at TIMESTAMP(6) NOT NULL,
    active_room_id VARCHAR(36),
    CONSTRAINT fk_magic_friend_presence_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_magic_friend_presence_seen
    ON magic_friend_presence(last_seen_at);
