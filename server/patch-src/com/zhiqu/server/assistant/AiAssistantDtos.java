package com.zhiqu.server.assistant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class AiAssistantDtos {
    private AiAssistantDtos() {
    }

    record ConfigResponse(
            boolean configured,
            String model,
            boolean longTermMemoryDefault,
            int maxMessageCharacters,
            int recentMessageLimit
    ) {
    }

    record CreateConversationRequest(
            @Size(max = 36) String requestId,
            Boolean memoryEnabled
    ) {
        boolean memoryEnabledOrDefault() {
            return Boolean.TRUE.equals(memoryEnabled);
        }

        String requestIdOrDefault() {
            return requestId == null || requestId.isBlank()
                    ? UUID.randomUUID().toString()
                    : requestId;
        }
    }

    record SendMessageRequest(
            @NotBlank @Size(max = 2000) String content,
            @NotBlank @Size(max = 36) String requestId,
            Boolean memoryEnabled
    ) {
        boolean memoryEnabledOrDefault() {
            return Boolean.TRUE.equals(memoryEnabled);
        }
    }

    record FeedbackRequest(
            @NotBlank @Size(max = 36) String requestId,
            @NotBlank @Size(max = 36) String messageId,
            @Size(max = 36) String contentId,
            boolean helpful
    ) {
    }

    record ConversationView(
            String id,
            String title,
            String summary,
            boolean memoryEnabled,
            Instant createdAt,
            Instant updatedAt,
            MessageView latestMessage
    ) {
    }

    record MessageView(
            String id,
            String conversationId,
            String role,
            String body,
            String intent,
            List<SourceView> sources,
            List<RecommendationView> recommendations,
            SafetyView safety,
            String requestId,
            Instant createdAt
    ) {
    }

    record ConversationCreatedResponse(ConversationView conversation, List<MessageView> messages) {
    }

    record MessageExchangeResponse(MessageView userMessage, MessageView assistantMessage) {
    }

    record SourceView(String id, String type, String title, String excerpt, String href) {
    }

    record RecommendationView(
            String contentId,
            String title,
            String summary,
            String coverUrl,
            String contentType,
            String categoryName,
            String difficulty,
            int durationMinutes,
            String reason,
            String href
    ) {
    }

    record SafetyView(String status, String reason) {
    }

    record FeedbackResponse(String id, boolean helpful, Instant createdAt) {
    }
}
