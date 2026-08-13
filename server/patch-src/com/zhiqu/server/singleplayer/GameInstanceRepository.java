package com.zhiqu.server.singleplayer;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class GameInstanceRepository {
    private final JdbcTemplate jdbc;

    public GameInstanceRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Optional<InstanceRow> findOwned(String userId, String instanceId) {
        return jdbc.query("""
                SELECT * FROM single_player_game_instances WHERE id = ? AND user_id = ?
                """, this::instanceRow, instanceId, userId).stream().findFirst();
    }

    Optional<InstanceRow> findByCreateRequest(String userId, String requestId) {
        return jdbc.query("""
                SELECT * FROM single_player_game_instances WHERE user_id = ? AND create_request_id = ?
                """, this::instanceRow, userId, requestId).stream().findFirst();
    }

    void insert(InstanceRow row) {
        jdbc.update("""
                INSERT INTO single_player_game_instances
                    (id, user_id, game_code, level_no, age_band, seed, status,
                     public_content_json, answer_spec_json, current_round, content_version,
                     model_name, failure_code, create_request_id, generation_request_id,
                     finish_request_id, finish_result_json, expires_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, NULL, NULL, ?, ?, NULL, NULL, ?, ?, ?)
                """,
                row.id(), row.userId(), row.gameCode(), row.levelNo(), row.ageBand(), row.seed(), row.status(),
                row.contentVersion(), row.createRequestId(), row.generationRequestId(),
                Timestamp.from(row.expiresAt()), Timestamp.from(row.createdAt()), Timestamp.from(row.updatedAt()));
    }

    void markGenerating(String instanceId, String seed, String requestId, Instant expiresAt, Instant now) {
        jdbc.update("""
                UPDATE single_player_game_instances
                SET seed = ?, status = 'GENERATING', public_content_json = NULL, answer_spec_json = NULL,
                    current_round = 0, model_name = NULL, failure_code = NULL,
                    generation_request_id = ?, finish_request_id = NULL, finish_result_json = NULL,
                    expires_at = ?, updated_at = ?
                WHERE id = ?
                """, seed, requestId, Timestamp.from(expiresAt), Timestamp.from(now), instanceId);
        jdbc.update("DELETE FROM single_player_game_submissions WHERE instance_id = ?", instanceId);
    }

    void markReady(String instanceId, String publicJson, String answerJson, String modelName, Instant now) {
        jdbc.update("""
                UPDATE single_player_game_instances
                SET status = 'READY', public_content_json = ?, answer_spec_json = ?, model_name = ?,
                    failure_code = NULL, updated_at = ?
                WHERE id = ? AND status = 'GENERATING'
                """, publicJson, answerJson, modelName, Timestamp.from(now), instanceId);
    }

    void markGenerationFailure(String instanceId, String status, String failureCode, Instant now) {
        jdbc.update("""
                UPDATE single_player_game_instances
                SET status = ?, public_content_json = NULL, answer_spec_json = NULL,
                    failure_code = ?, updated_at = ?
                WHERE id = ? AND status = 'GENERATING'
                """, status, failureCode, Timestamp.from(now), instanceId);
    }

    int markInterruptedGenerations(Instant now) {
        return jdbc.update("""
                UPDATE single_player_game_instances
                SET status = 'FAILED', public_content_json = NULL, answer_spec_json = NULL,
                    failure_code = 'GENERATION_INTERRUPTED', updated_at = ?
                WHERE status = 'GENERATING'
                """, Timestamp.from(now));
    }

    Optional<SubmissionRow> findSubmission(String instanceId, String roundId, String requestId) {
        return jdbc.query("""
                SELECT id, instance_id, round_id, request_id, action_json, evaluation_json, created_at
                FROM single_player_game_submissions
                WHERE instance_id = ? AND round_id = ? AND request_id = ?
                """, this::submissionRow, instanceId, roundId, requestId).stream().findFirst();
    }

    List<SubmissionRow> listSubmissions(String instanceId) {
        return jdbc.query("""
                SELECT id, instance_id, round_id, request_id, action_json, evaluation_json, created_at
                FROM single_player_game_submissions
                WHERE instance_id = ? ORDER BY created_at, id
                """, this::submissionRow, instanceId);
    }

    SubmissionRow insertSubmission(
            String instanceId,
            String roundId,
            String requestId,
            String actionJson,
            String evaluationJson,
            Instant now
    ) {
        SubmissionRow row = new SubmissionRow(
                java.util.UUID.randomUUID().toString(), instanceId, roundId, requestId, actionJson, evaluationJson, now);
        try {
            jdbc.update("""
                    INSERT INTO single_player_game_submissions
                        (id, instance_id, round_id, request_id, action_json, evaluation_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, row.id(), instanceId, roundId, requestId, actionJson, evaluationJson, Timestamp.from(now));
            return row;
        } catch (DuplicateKeyException duplicate) {
            return findSubmission(instanceId, roundId, requestId).orElseThrow(() -> duplicate);
        }
    }

    int advanceRound(String instanceId, int expectedCurrentRound, Instant now) {
        return jdbc.update("""
                UPDATE single_player_game_instances
                SET current_round = ?, updated_at = ?
                WHERE id = ? AND status = 'READY' AND current_round = ?
                """, expectedCurrentRound + 1, Timestamp.from(now), instanceId, expectedCurrentRound);
    }

    int markCompleted(String instanceId, String requestId, int requiredRounds, Instant now) {
        return jdbc.update("""
                UPDATE single_player_game_instances
                SET status = 'COMPLETED', finish_request_id = ?, updated_at = ?
                WHERE id = ? AND status = 'READY' AND current_round = ?
                """, requestId, Timestamp.from(now), instanceId, requiredRounds);
    }

    void storeFinishResult(String instanceId, String finishJson, Instant now) {
        jdbc.update("""
                UPDATE single_player_game_instances SET finish_result_json = ?, updated_at = ? WHERE id = ?
                """, finishJson, Timestamp.from(now), instanceId);
    }

    ProgressRow upsertProgress(
            String userId,
            String gameCode,
            int levelNo,
            String abilityJson,
            String resultJson,
            Instant now
    ) {
        int updated = jdbc.update("""
                UPDATE single_player_game_progress
                SET completed = TRUE, ability_json = ?, best_result_json = ?,
                    completed_at = COALESCE(completed_at, ?), updated_at = ?
                WHERE user_id = ? AND game_code = ? AND level_no = ?
                """, abilityJson, resultJson, Timestamp.from(now), Timestamp.from(now), userId, gameCode, levelNo);
        if (updated == 0) {
            try {
                jdbc.update("""
                        INSERT INTO single_player_game_progress
                            (user_id, game_code, level_no, completed, ability_json, best_result_json, completed_at, updated_at)
                        VALUES (?, ?, ?, TRUE, ?, ?, ?, ?)
                        """, userId, gameCode, levelNo, abilityJson, resultJson, Timestamp.from(now), Timestamp.from(now));
            } catch (DuplicateKeyException duplicate) {
                jdbc.update("""
                        UPDATE single_player_game_progress
                        SET completed = TRUE, ability_json = ?, best_result_json = ?,
                            completed_at = COALESCE(completed_at, ?), updated_at = ?
                        WHERE user_id = ? AND game_code = ? AND level_no = ?
                        """, abilityJson, resultJson, Timestamp.from(now), Timestamp.from(now), userId, gameCode, levelNo);
            }
        }
        return findProgress(userId, gameCode, levelNo).orElseThrow();
    }

    List<ProgressRow> listProgress(String userId) {
        return jdbc.query("""
                SELECT user_id, game_code, level_no, completed, ability_json, best_result_json,
                       completed_at, updated_at
                FROM single_player_game_progress
                WHERE user_id = ? ORDER BY game_code, level_no
                """, this::progressRow, userId);
    }

    Optional<ProgressRow> findProgress(String userId, String gameCode, int levelNo) {
        return jdbc.query("""
                SELECT user_id, game_code, level_no, completed, ability_json, best_result_json,
                       completed_at, updated_at
                FROM single_player_game_progress
                WHERE user_id = ? AND game_code = ? AND level_no = ?
                """, this::progressRow, userId, gameCode, levelNo).stream().findFirst();
    }

    Optional<LocalDate> birthDate(String userId) {
        return jdbc.query("SELECT birth_date FROM social_profiles WHERE user_id = ?", (rs, rowNum) -> {
            java.sql.Date date = rs.getDate(1);
            return date == null ? null : date.toLocalDate();
        }, userId).stream().filter(java.util.Objects::nonNull).findFirst();
    }

    List<PromptSetRow> listApprovedPromptSets(String ageBand) {
        return jdbc.query("""
                SELECT id, age_band, content_version, public_content_json, answer_spec_json,
                       source_type, source_model, review_status, enabled, reviewed_at, created_at, updated_at
                FROM single_player_prompt_sets
                WHERE age_band = ? AND review_status = 'APPROVED' AND enabled = TRUE
                ORDER BY id
                """, this::promptSetRow, ageBand);
    }

    void saveApprovedPromptSet(PromptSetRow row) {
        int updated = jdbc.update("""
                UPDATE single_player_prompt_sets
                SET age_band = ?, content_version = ?, public_content_json = ?, answer_spec_json = ?,
                    source_type = ?, source_model = ?, review_status = 'APPROVED', enabled = TRUE,
                    reviewed_at = ?, updated_at = ?
                WHERE id = ?
                """,
                row.ageBand(), row.contentVersion(), row.publicContentJson(), row.answerSpecJson(),
                row.sourceType(), row.sourceModel(), Timestamp.from(row.reviewedAt()), Timestamp.from(row.updatedAt()),
                row.id());
        if (updated > 0) return;
        jdbc.update("""
                INSERT INTO single_player_prompt_sets
                    (id, age_band, content_version, public_content_json, answer_spec_json,
                     source_type, source_model, review_status, enabled, reviewer_id,
                     reviewed_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', TRUE, NULL, ?, ?, ?)
                """,
                row.id(), row.ageBand(), row.contentVersion(), row.publicContentJson(), row.answerSpecJson(),
                row.sourceType(), row.sourceModel(), Timestamp.from(row.reviewedAt()),
                Timestamp.from(row.createdAt()), Timestamp.from(row.updatedAt()));
    }

    private InstanceRow instanceRow(ResultSet rs, int rowNum) throws SQLException {
        return new InstanceRow(
                rs.getString("id"), rs.getString("user_id"), rs.getString("game_code"), rs.getInt("level_no"),
                rs.getString("age_band"), rs.getString("seed"), rs.getString("status"),
                rs.getString("public_content_json"), rs.getString("answer_spec_json"), rs.getInt("current_round"),
                rs.getString("content_version"), rs.getString("model_name"), rs.getString("failure_code"),
                rs.getString("create_request_id"), rs.getString("generation_request_id"), rs.getString("finish_request_id"),
                rs.getString("finish_result_json"), instant(rs, "expires_at"), instant(rs, "created_at"), instant(rs, "updated_at")
        );
    }

    private SubmissionRow submissionRow(ResultSet rs, int rowNum) throws SQLException {
        return new SubmissionRow(
                rs.getString("id"), rs.getString("instance_id"), rs.getString("round_id"), rs.getString("request_id"),
                rs.getString("action_json"), rs.getString("evaluation_json"), instant(rs, "created_at")
        );
    }

    private ProgressRow progressRow(ResultSet rs, int rowNum) throws SQLException {
        return new ProgressRow(
                rs.getString("user_id"), rs.getString("game_code"), rs.getInt("level_no"), rs.getBoolean("completed"),
                rs.getString("ability_json"), rs.getString("best_result_json"), nullableInstant(rs, "completed_at"),
                instant(rs, "updated_at")
        );
    }

    private PromptSetRow promptSetRow(ResultSet rs, int rowNum) throws SQLException {
        return new PromptSetRow(
                rs.getString("id"), rs.getString("age_band"), rs.getString("content_version"),
                rs.getString("public_content_json"), rs.getString("answer_spec_json"),
                rs.getString("source_type"), rs.getString("source_model"),
                rs.getString("review_status"), rs.getBoolean("enabled"),
                nullableInstant(rs, "reviewed_at"), instant(rs, "created_at"), instant(rs, "updated_at")
        );
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column).toInstant();
    }

    private static Instant nullableInstant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    record InstanceRow(
            String id,
            String userId,
            String gameCode,
            int levelNo,
            String ageBand,
            String seed,
            String status,
            String publicContentJson,
            String answerSpecJson,
            int currentRound,
            String contentVersion,
            String modelName,
            String failureCode,
            String createRequestId,
            String generationRequestId,
            String finishRequestId,
            String finishResultJson,
            Instant expiresAt,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    record SubmissionRow(
            String id,
            String instanceId,
            String roundId,
            String requestId,
            String actionJson,
            String evaluationJson,
            Instant createdAt
    ) {
    }

    record ProgressRow(
            String userId,
            String gameCode,
            int levelNo,
            boolean completed,
            String abilityJson,
            String bestResultJson,
            Instant completedAt,
            Instant updatedAt
    ) {
    }

    record PromptSetRow(
            String id,
            String ageBand,
            String contentVersion,
            String publicContentJson,
            String answerSpecJson,
            String sourceType,
            String sourceModel,
            String reviewStatus,
            boolean enabled,
            Instant reviewedAt,
            Instant createdAt,
            Instant updatedAt
    ) {
    }
}
