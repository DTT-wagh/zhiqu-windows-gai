CREATE TABLE single_player_prompt_sets (
    id VARCHAR(64) PRIMARY KEY,
    age_band VARCHAR(8) NOT NULL,
    content_version VARCHAR(24) NOT NULL,
    public_content_json TEXT NOT NULL,
    answer_spec_json TEXT NOT NULL,
    source_type VARCHAR(16) NOT NULL,
    source_model VARCHAR(120),
    review_status VARCHAR(16) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    reviewer_id VARCHAR(36),
    reviewed_at TIMESTAMP(6),
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT chk_prompt_set_age CHECK (age_band IN ('6-8', '9-10', '11-12')),
    CONSTRAINT chk_prompt_set_source CHECK (source_type IN ('MANUAL', 'AI_GENERATED')),
    CONSTRAINT chk_prompt_set_review CHECK (review_status IN ('DRAFT', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_prompt_set_runtime
    ON single_player_prompt_sets(age_band, enabled, review_status, updated_at);
