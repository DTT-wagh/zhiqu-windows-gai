package com.zhiqu.server.singleplayer;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import tools.jackson.databind.JsonNode;

public final class SinglePlayerGameDtos {
    private SinglePlayerGameDtos() {
    }

    public record GameSummary(
            String gameCode,
            String title,
            String subject,
            String description,
            String learningGoal,
            List<String> ageBands,
            int estimatedMinutes,
            int levelNo
    ) {
    }

    public record CreateInstanceRequest(
            @NotBlank @Size(max = 36) String requestId,
            @Min(1) @Max(1) int levelNo,
            @Pattern(regexp = "6-8|9-10|11-12") String ageBand
    ) {
    }

    public record MutationRequest(@NotBlank @Size(max = 36) String requestId) {
    }

    public record SubmitRoundRequest(
            @NotBlank @Size(max = 36) String requestId,
            @NotNull JsonNode action
    ) {
    }

    public record FinishRequest(
            @NotBlank @Size(max = 36) String requestId,
            @Size(max = 500) String discovery
    ) {
    }

    public record InstanceView(
            String instanceId,
            String gameCode,
            int levelNo,
            String ageBand,
            String status,
            int currentRound,
            String contentVersion,
            String modelName,
            JsonNode content,
            String failureCode,
            Instant expiresAt,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record EvaluationView(
            String submissionId,
            String roundId,
            boolean correct,
            String hint,
            String feedback,
            JsonNode comparison,
            JsonNode ability,
            int currentRound,
            boolean allRoundsComplete,
            Instant createdAt
    ) {
    }

    public record ProgressView(
            String gameCode,
            boolean completed,
            JsonNode ability,
            JsonNode bestResult,
            Instant completedAt,
            Instant updatedAt
    ) {
    }

    public record RewardView(
            String ledgerId,
            int nominalXp,
            int awardedXp,
            boolean capped,
            boolean duplicate
    ) {
    }

    public record FinishView(
            String instanceId,
            String status,
            JsonNode discovery,
            ProgressView progress,
            RewardView reward
    ) {
    }
}
