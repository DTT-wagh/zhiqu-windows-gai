CREATE TABLE single_player_game_instances (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    game_code VARCHAR(40) NOT NULL,
    level_no INT NOT NULL,
    age_band VARCHAR(8) NOT NULL,
    seed VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    public_content_json TEXT,
    answer_spec_json TEXT,
    current_round INT NOT NULL DEFAULT 0,
    content_version VARCHAR(24) NOT NULL,
    model_name VARCHAR(120),
    failure_code VARCHAR(64),
    create_request_id VARCHAR(36) NOT NULL,
    generation_request_id VARCHAR(36),
    finish_request_id VARCHAR(36),
    finish_result_json TEXT,
    expires_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_single_player_instance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uk_single_player_instance_create UNIQUE (user_id, create_request_id),
    CONSTRAINT chk_single_player_instance_level CHECK (level_no BETWEEN 1 AND 12),
    CONSTRAINT chk_single_player_instance_age CHECK (age_band IN ('6-8', '9-10', '11-12')),
    CONSTRAINT chk_single_player_instance_status CHECK (status IN ('GENERATING', 'READY', 'FAILED', 'REJECTED', 'COMPLETED')),
    CONSTRAINT chk_single_player_instance_round CHECK (current_round BETWEEN 0 AND 3)
);

CREATE INDEX idx_single_player_instance_user
    ON single_player_game_instances(user_id, game_code, level_no, updated_at);

CREATE INDEX idx_single_player_instance_status
    ON single_player_game_instances(status, expires_at);

CREATE TABLE single_player_game_submissions (
    id VARCHAR(36) PRIMARY KEY,
    instance_id VARCHAR(36) NOT NULL,
    round_id VARCHAR(12) NOT NULL,
    request_id VARCHAR(36) NOT NULL,
    action_json TEXT NOT NULL,
    evaluation_json TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_single_player_submission_instance FOREIGN KEY (instance_id) REFERENCES single_player_game_instances(id) ON DELETE CASCADE,
    CONSTRAINT uk_single_player_submission_request UNIQUE (instance_id, round_id, request_id)
);

CREATE INDEX idx_single_player_submission_instance
    ON single_player_game_submissions(instance_id, round_id, created_at);

CREATE TABLE single_player_game_progress (
    user_id VARCHAR(36) NOT NULL,
    game_code VARCHAR(40) NOT NULL,
    level_no INT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    ability_json TEXT NOT NULL,
    best_result_json TEXT,
    completed_at TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (user_id, game_code, level_no),
    CONSTRAINT fk_single_player_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_single_player_progress_level CHECK (level_no BETWEEN 1 AND 12)
);

CREATE INDEX idx_single_player_progress_user
    ON single_player_game_progress(user_id, game_code, completed, updated_at);
