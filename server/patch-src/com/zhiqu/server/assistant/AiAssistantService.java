package com.zhiqu.server.assistant;

import com.zhiqu.server.assistant.AiAssistantClient.ModelRecommendation;
import com.zhiqu.server.assistant.AiAssistantClient.ModelResult;
import com.zhiqu.server.assistant.AiAssistantDtos.ConfigResponse;
import com.zhiqu.server.assistant.AiAssistantDtos.ConversationCreatedResponse;
import com.zhiqu.server.assistant.AiAssistantDtos.ConversationView;
import com.zhiqu.server.assistant.AiAssistantDtos.FeedbackRequest;
import com.zhiqu.server.assistant.AiAssistantDtos.FeedbackResponse;
import com.zhiqu.server.assistant.AiAssistantDtos.MessageExchangeResponse;
import com.zhiqu.server.assistant.AiAssistantDtos.MessageView;
import com.zhiqu.server.assistant.AiAssistantDtos.RecommendationView;
import com.zhiqu.server.assistant.AiAssistantDtos.SafetyView;
import com.zhiqu.server.assistant.AiAssistantDtos.SendMessageRequest;
import com.zhiqu.server.assistant.AiAssistantDtos.SourceView;
import com.zhiqu.server.common.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Service
public class AiAssistantService {
    private static final int RECENT_MESSAGE_LIMIT = 12;
    private static final int RATE_LIMIT_PER_MINUTE = 12;
    private static final String ALICE_TRIGGER = "心爱的少女在哪里？";
    private static final String ALICE_ACTIVATION_REPLY = "我爱你";
    private static final Pattern EMAIL = Pattern.compile("(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}");
    private static final Pattern MOBILE = Pattern.compile("(?<!\\d)1[3-9]\\d{9}(?!\\d)");
    private static final Pattern CONTACT_ACCOUNT = Pattern.compile("(?i)(QQ|微信|vx|wechat)\\s*[:：号]?\\s*[a-z0-9_-]{5,20}");
    private static final Pattern LONG_NUMBER = Pattern.compile("(?<!\\d)\\d{15,18}[0-9Xx]?(?!\\d)");
    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm EEEE", Locale.SIMPLIFIED_CHINESE)
            .withZone(ZoneId.of("Asia/Shanghai"));

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final AiAssistantClient client;
    private final AiAssistantGenerationRegistry generationRegistry;
    private final ConcurrentHashMap<String, Deque<Long>> requestWindows = new ConcurrentHashMap<>();

    public AiAssistantService(
            JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            AiAssistantClient client,
            AiAssistantGenerationRegistry generationRegistry
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.client = client;
        this.generationRegistry = generationRegistry;
    }

    ConfigResponse config(String userId) {
        requireUser(userId);
        return new ConfigResponse(client.configured(), client.model(), false, 2000, RECENT_MESSAGE_LIMIT);
    }

    List<ConversationView> listConversations(String userId) {
        requireUser(userId);
        return jdbc.query("""
                SELECT id, title, summary, memory_enabled, created_at, updated_at
                FROM assistant_conversations
                WHERE user_id = ? AND deleted_at IS NULL
                ORDER BY updated_at DESC
                """, (rs, rowNum) -> conversationView(rs, userId), userId);
    }

    ConversationCreatedResponse createConversation(
            String userId,
            boolean memoryEnabled,
            String requestId
    ) {
        requireUser(userId);
        enforceRateLimit(userId);

        String conversationId = UUID.randomUUID().toString();
        AiAssistantGenerationRegistry.GenerationHandle generation = generationRegistry.begin(
                userId,
                conversationId,
                requestId
        );
        try {
            generation.throwIfCancelled();
            List<SourceCandidate> suppliedSources = loadSourceCandidates();
            List<ContentCandidate> catalog = loadCatalog(userId);
            String context = buildContext(
                    "FIRST_GREETING",
                    userId,
                    conversationId,
                    "",
                    memoryEnabled,
                    List.of(),
                    suppliedSources,
                    catalog
            );
            ModelResult model = validateModelResult(
                    applyPersonaReply(client.generate(context, generation), false),
                    suppliedSources,
                    catalog
            );
            generation.throwIfCancelled();
            Instant now = Instant.now();
            String title = "AI 助手 " + DateTimeFormatter.ofPattern("MM-dd HH:mm")
                    .withZone(ZoneId.of("Asia/Shanghai"))
                    .format(now);
            jdbc.update("""
                    INSERT INTO assistant_conversations
                        (id, user_id, title, summary, memory_enabled, created_at, updated_at, deleted_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
                    """, conversationId, userId, title, blankToNull(model.conversationSummary()), memoryEnabled, Timestamp.from(now), Timestamp.from(now));

            MessageView greeting = insertAssistantMessage(conversationId, null, model, suppliedSources, catalog, now);
            if (memoryEnabled) persistMemory(userId, model.conversationSummary(), true);
            return new ConversationCreatedResponse(requireConversationView(userId, conversationId), List.of(greeting));
        } finally {
            generationRegistry.finish(generation);
        }
    }

    List<MessageView> listMessages(String userId, String conversationId) {
        requireConversation(userId, conversationId);
        return jdbc.query("""
                SELECT id, conversation_id, role, body, intent, sources_json, recommendations_json,
                       safety_status, safety_reason, request_id, created_at
                FROM assistant_messages
                WHERE conversation_id = ?
                ORDER BY created_at, id
                """, (rs, rowNum) -> messageView(rs), conversationId);
    }

    MessageExchangeResponse sendMessage(String userId, String conversationId, SendMessageRequest request) {
        ConversationRow conversation = requireConversation(userId, conversationId);
        MessageView existingUser = findMessageByRequest(userId, request.requestId());
        if (existingUser != null) {
            MessageView existingAssistant = findAssistantReply(existingUser.id());
            if (existingAssistant != null) return new MessageExchangeResponse(existingUser, existingAssistant);
        }

        AiAssistantGenerationRegistry.GenerationHandle generation = generationRegistry.begin(
                userId,
                conversationId,
                request.requestId()
        );
        try {
            generation.throwIfCancelled();
            enforceRateLimit(userId);
            String safeContent = sanitizeUserContent(request.content());
            boolean memoryEnabled = request.memoryEnabledOrDefault();
            Instant now = Instant.now();
            MessageView userMessage = existingUser;
            if (userMessage == null) {
                String messageId = UUID.randomUUID().toString();
                try {
                    jdbc.update("""
                            INSERT INTO assistant_messages
                                (id, conversation_id, author_user_id, role, body, intent, sources_json,
                                 recommendations_json, safety_status, safety_reason, request_id,
                                 reply_to_message_id, created_at)
                            VALUES (?, ?, ?, 'USER', ?, NULL, NULL, NULL, 'NOT_CHECKED', NULL, ?, NULL, ?)
                            """, messageId, conversationId, userId, safeContent, request.requestId(), Timestamp.from(now));
                    userMessage = findMessageByRequest(userId, request.requestId());
                } catch (DuplicateKeyException duplicate) {
                    userMessage = findMessageByRequest(userId, request.requestId());
                }
            }
            if (userMessage == null) {
                throw new ApiException(HttpStatus.CONFLICT, "ASSISTANT_REQUEST_CONFLICT", "消息请求发生冲突，请重试");
            }

            List<MessageView> recentMessages = recentMessages(conversationId);
            List<SourceCandidate> suppliedSources = loadSourceCandidates();
            List<ContentCandidate> catalog = loadCatalog(userId);
            String context = buildContext(
                    "RESPOND",
                    userId,
                    conversationId,
                    conversation.summary(),
                    memoryEnabled,
                    recentMessages,
                    suppliedSources,
                    catalog
            );
            ModelResult model = validateModelResult(
                    applyPersonaReply(client.generate(context, generation), ALICE_TRIGGER.equals(safeContent)),
                    suppliedSources,
                    catalog
            );
            generation.throwIfCancelled();
            MessageView assistant;
            try {
                assistant = insertAssistantMessage(conversationId, userMessage.id(), model, suppliedSources, catalog, Instant.now());
            } catch (DuplicateKeyException duplicate) {
                assistant = findAssistantReply(userMessage.id());
                if (assistant == null) throw duplicate;
            }

            updateConversationAfterMessage(userId, conversationId, safeContent, model.conversationSummary(), memoryEnabled);
            persistMemory(userId, model.conversationSummary(), memoryEnabled);
            return new MessageExchangeResponse(userMessage, assistant);
        } finally {
            generationRegistry.finish(generation);
        }
    }

    @Transactional
    MessageExchangeResponse editMessage(
            String userId,
            String conversationId,
            String messageId,
            SendMessageRequest request
    ) {
        ConversationRow conversation = requireConversation(userId, conversationId);
        MessageView userMessage = findUserMessage(conversationId, messageId);
        if (userMessage == null) throw notFound("用户消息不存在");

        MessageView existingRequest = findMessageByRequest(userId, request.requestId());
        if (existingRequest != null) {
            if (!existingRequest.id().equals(messageId)) {
                throw new ApiException(HttpStatus.CONFLICT, "ASSISTANT_REQUEST_CONFLICT", "消息请求发生冲突，请重试");
            }
            MessageView existingReply = findAssistantReply(messageId);
            if (existingReply != null) return new MessageExchangeResponse(existingRequest, existingReply);
        }

        String latestUserMessageId = latestUserMessageId(conversationId);
        if (!messageId.equals(latestUserMessageId)) {
            throw new ApiException(HttpStatus.CONFLICT, "ASSISTANT_EDIT_NOT_LATEST", "只能编辑最近一条用户消息");
        }

        AiAssistantGenerationRegistry.GenerationHandle generation = generationRegistry.begin(
                userId,
                conversationId,
                request.requestId()
        );
        try {
            generation.throwIfCancelled();
            enforceRateLimit(userId);
            String safeContent = sanitizeUserContent(request.content());
            boolean memoryEnabled = request.memoryEnabledOrDefault();
            jdbc.update("""
                    UPDATE assistant_messages
                    SET body = ?, request_id = ?, safety_status = 'NOT_CHECKED', safety_reason = NULL
                    WHERE id = ? AND conversation_id = ? AND role = 'USER'
                    """, safeContent, request.requestId(), messageId, conversationId);
            userMessage = findUserMessage(conversationId, messageId);

            List<MessageView> recentMessages = recentMessagesForEdit(conversationId, messageId);
            List<SourceCandidate> suppliedSources = loadSourceCandidates();
            List<ContentCandidate> catalog = loadCatalog(userId);
            String context = buildContext(
                    "EDIT",
                    userId,
                    conversationId,
                    conversation.summary(),
                    memoryEnabled,
                    recentMessages,
                    suppliedSources,
                    catalog
            );
            ModelResult model = validateModelResult(
                    client.generate(context, generation),
                    suppliedSources,
                    catalog
            );
            generation.throwIfCancelled();
            MessageView assistant = replaceAssistantMessage(
                    conversationId,
                    messageId,
                    model,
                    suppliedSources,
                    catalog,
                    Instant.now()
            );

            updateConversationAfterMessage(userId, conversationId, safeContent, model.conversationSummary(), memoryEnabled);
            persistMemory(userId, model.conversationSummary(), memoryEnabled);
            return new MessageExchangeResponse(userMessage, assistant);
        } finally {
            generationRegistry.finish(generation);
        }
    }

    void cancelGeneration(String userId, String requestId) {
        requireUser(userId);
        if (requestId == null || requestId.isBlank() || requestId.length() > 36) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ASSISTANT_REQUEST_ID_INVALID", "请求标识无效");
        }
        generationRegistry.cancel(userId, requestId);
    }

    List<RecommendationView> recommendations(String userId) {
        requireUser(userId);
        return loadCatalog(userId).stream().limit(6).map(candidate -> candidate.toRecommendation(ruleReason(candidate))).toList();
    }

    @Transactional
    FeedbackResponse feedback(String userId, FeedbackRequest request) {
        requireUser(userId);
        List<FeedbackResponse> existing = jdbc.query("""
                SELECT id, helpful, created_at
                FROM assistant_recommendation_events
                WHERE user_id = ? AND request_id = ?
                """, (rs, rowNum) -> new FeedbackResponse(rs.getString("id"), rs.getBoolean("helpful"), instant(rs, "created_at")),
                userId, request.requestId());
        if (!existing.isEmpty()) return existing.get(0);

        List<Map<String, Object>> messages = jdbc.queryForList("""
                SELECT m.id, m.conversation_id
                FROM assistant_messages m
                JOIN assistant_conversations c ON c.id = m.conversation_id
                WHERE m.id = ? AND c.user_id = ? AND c.deleted_at IS NULL AND m.role = 'ASSISTANT'
                """, request.messageId(), userId);
        if (messages.isEmpty()) throw notFound("消息不存在");
        if (request.contentId() != null && !request.contentId().isBlank()) {
            Integer contentCount = jdbc.queryForObject("SELECT COUNT(*) FROM contents WHERE id = ? AND status = 'PUBLISHED'", Integer.class, request.contentId());
            if (contentCount == null || contentCount == 0) throw notFound("推荐内容不存在");
        }

        String id = UUID.randomUUID().toString();
        Instant now = Instant.now();
        jdbc.update("""
                INSERT INTO assistant_recommendation_events
                    (id, user_id, conversation_id, message_id, content_id, event_type,
                     helpful, metadata_json, request_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                """, id, userId, String.valueOf(messages.get(0).get("conversation_id")), request.messageId(),
                blankToNull(request.contentId()), request.helpful() ? "HELPFUL" : "NOT_HELPFUL",
                request.helpful(), request.requestId(), Timestamp.from(now));
        return new FeedbackResponse(id, request.helpful(), now);
    }

    @Transactional
    void deleteConversation(String userId, String conversationId) {
        int changed = jdbc.update("""
                UPDATE assistant_conversations
                SET deleted_at = ?, updated_at = ?
                WHERE id = ? AND user_id = ? AND deleted_at IS NULL
                """, Timestamp.from(Instant.now()), Timestamp.from(Instant.now()), conversationId, userId);
        if (changed == 0) throw notFound("会话不存在");
    }

    @Transactional
    void deleteMessage(String userId, String conversationId, String messageId) {
        requireConversation(userId, conversationId);
        List<String> roles = jdbc.query("""
                SELECT role
                FROM assistant_messages
                WHERE id = ? AND conversation_id = ?
                """, (rs, rowNum) -> rs.getString("role"), messageId, conversationId);
        if (roles.isEmpty()) throw notFound("消息不存在");

        if ("USER".equals(roles.get(0))) {
            jdbc.update("""
                    DELETE FROM assistant_messages
                    WHERE conversation_id = ? AND reply_to_message_id = ? AND role = 'ASSISTANT'
                    """, conversationId, messageId);
        }
        int changed = jdbc.update("""
                DELETE FROM assistant_messages
                WHERE id = ? AND conversation_id = ?
                """, messageId, conversationId);
        if (changed == 0) throw notFound("消息不存在");
        jdbc.update("""
                UPDATE assistant_conversations
                SET updated_at = ?
                WHERE id = ? AND user_id = ? AND deleted_at IS NULL
                """, Timestamp.from(Instant.now()), conversationId, userId);
    }

    private ConversationView conversationView(ResultSet rs, String userId) throws SQLException {
        String id = rs.getString("id");
        List<MessageView> latest = jdbc.query("""
                SELECT id, conversation_id, role, body, intent, sources_json, recommendations_json,
                       safety_status, safety_reason, request_id, created_at
                FROM assistant_messages
                WHERE conversation_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """, (messageRs, rowNum) -> messageView(messageRs), id);
        return new ConversationView(
                id,
                rs.getString("title"),
                rs.getString("summary"),
                rs.getBoolean("memory_enabled"),
                instant(rs, "created_at"),
                instant(rs, "updated_at"),
                latest.isEmpty() ? null : latest.get(0)
        );
    }

    private ConversationView requireConversationView(String userId, String conversationId) {
        return jdbc.query("""
                SELECT id, title, summary, memory_enabled, created_at, updated_at
                FROM assistant_conversations
                WHERE id = ? AND user_id = ? AND deleted_at IS NULL
                """, (rs, rowNum) -> conversationView(rs, userId), conversationId, userId)
                .stream().findFirst().orElseThrow(() -> notFound("会话不存在"));
    }

    private ConversationRow requireConversation(String userId, String conversationId) {
        return jdbc.query("""
                SELECT id, summary, memory_enabled
                FROM assistant_conversations
                WHERE id = ? AND user_id = ? AND deleted_at IS NULL
                """, (rs, rowNum) -> new ConversationRow(rs.getString("id"), rs.getString("summary"), rs.getBoolean("memory_enabled")),
                conversationId, userId).stream().findFirst().orElseThrow(() -> notFound("会话不存在"));
    }

    private MessageView findMessageByRequest(String userId, String requestId) {
        return jdbc.query("""
                SELECT m.id, m.conversation_id, m.role, m.body, m.intent, m.sources_json,
                       m.recommendations_json, m.safety_status, m.safety_reason, m.request_id, m.created_at
                FROM assistant_messages m
                JOIN assistant_conversations c ON c.id = m.conversation_id
                WHERE m.request_id = ? AND c.user_id = ? AND c.deleted_at IS NULL
                """, (rs, rowNum) -> messageView(rs), requestId, userId).stream().findFirst().orElse(null);
    }

    private MessageView findAssistantReply(String userMessageId) {
        return jdbc.query("""
                SELECT id, conversation_id, role, body, intent, sources_json, recommendations_json,
                       safety_status, safety_reason, request_id, created_at
                FROM assistant_messages
                WHERE reply_to_message_id = ? AND role = 'ASSISTANT'
                """, (rs, rowNum) -> messageView(rs), userMessageId).stream().findFirst().orElse(null);
    }

    private MessageView findUserMessage(String conversationId, String messageId) {
        return jdbc.query("""
                SELECT id, conversation_id, role, body, intent, sources_json, recommendations_json,
                       safety_status, safety_reason, request_id, created_at
                FROM assistant_messages
                WHERE id = ? AND conversation_id = ? AND role = 'USER'
                """, (rs, rowNum) -> messageView(rs), messageId, conversationId).stream().findFirst().orElse(null);
    }

    private String latestUserMessageId(String conversationId) {
        return jdbc.query("""
                SELECT id FROM assistant_messages
                WHERE conversation_id = ? AND role = 'USER'
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """, (rs, rowNum) -> rs.getString("id"), conversationId).stream().findFirst().orElse(null);
    }

    private List<MessageView> recentMessages(String conversationId) {
        List<MessageView> reversed = jdbc.query("""
                SELECT id, conversation_id, role, body, intent, sources_json, recommendations_json,
                       safety_status, safety_reason, request_id, created_at
                FROM assistant_messages
                WHERE conversation_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """, (rs, rowNum) -> messageView(rs), conversationId, RECENT_MESSAGE_LIMIT);
        java.util.Collections.reverse(reversed);
        return reversed;
    }

    private List<MessageView> recentMessagesForEdit(String conversationId, String userMessageId) {
        List<MessageView> reversed = jdbc.query("""
                SELECT id, conversation_id, role, body, intent, sources_json, recommendations_json,
                       safety_status, safety_reason, request_id, created_at
                FROM assistant_messages
                WHERE conversation_id = ?
                  AND (reply_to_message_id IS NULL OR reply_to_message_id <> ?)
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """, (rs, rowNum) -> messageView(rs), conversationId, userMessageId, RECENT_MESSAGE_LIMIT);
        java.util.Collections.reverse(reversed);
        return reversed;
    }

    private MessageView insertAssistantMessage(
            String conversationId,
            String replyToMessageId,
            ModelResult model,
            List<SourceCandidate> suppliedSources,
            List<ContentCandidate> catalog,
            Instant createdAt
    ) {
        Map<String, SourceCandidate> sourceMap = suppliedSources.stream()
                .collect(Collectors.toMap(SourceCandidate::id, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Map<String, ContentCandidate> contentMap = catalog.stream()
                .collect(Collectors.toMap(ContentCandidate::id, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        List<SourceView> sources = model.sourceIds().stream()
                .map(sourceMap::get).filter(java.util.Objects::nonNull).map(SourceCandidate::toView).toList();
        List<RecommendationView> recommendations = model.recommendations().stream()
                .filter(item -> contentMap.containsKey(item.contentId()))
                .map(item -> contentMap.get(item.contentId()).toRecommendation(item.reason()))
                .toList();

        String id = UUID.randomUUID().toString();
        String safeReply = redactPrivacy(model.reply());
        jdbc.update("""
                INSERT INTO assistant_messages
                    (id, conversation_id, author_user_id, role, body, intent, sources_json,
                     recommendations_json, safety_status, safety_reason, request_id,
                     reply_to_message_id, created_at)
                VALUES (?, ?, NULL, 'ASSISTANT', ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                """, id, conversationId, safeReply, model.intent(), json(sources), json(recommendations),
                model.safetyStatus(), blankToNull(model.safetyReason()), replyToMessageId, Timestamp.from(createdAt));
        return new MessageView(
                id, conversationId, "ASSISTANT", safeReply, model.intent(), sources, recommendations,
                new SafetyView(model.safetyStatus(), model.safetyReason()), null, createdAt
        );
    }

    private MessageView replaceAssistantMessage(
            String conversationId,
            String replyToMessageId,
            ModelResult model,
            List<SourceCandidate> suppliedSources,
            List<ContentCandidate> catalog,
            Instant createdAt
    ) {
        MessageView existing = findAssistantReply(replyToMessageId);
        if (existing == null) {
            return insertAssistantMessage(conversationId, replyToMessageId, model, suppliedSources, catalog, createdAt);
        }

        Map<String, SourceCandidate> sourceMap = suppliedSources.stream()
                .collect(Collectors.toMap(SourceCandidate::id, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Map<String, ContentCandidate> contentMap = catalog.stream()
                .collect(Collectors.toMap(ContentCandidate::id, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        List<SourceView> sources = model.sourceIds().stream()
                .map(sourceMap::get).filter(java.util.Objects::nonNull).map(SourceCandidate::toView).toList();
        List<RecommendationView> recommendations = model.recommendations().stream()
                .filter(item -> contentMap.containsKey(item.contentId()))
                .map(item -> contentMap.get(item.contentId()).toRecommendation(item.reason()))
                .toList();
        String safeReply = redactPrivacy(model.reply());

        jdbc.update("DELETE FROM assistant_recommendation_events WHERE message_id = ?", existing.id());
        jdbc.update("""
                UPDATE assistant_messages
                SET body = ?, intent = ?, sources_json = ?, recommendations_json = ?,
                    safety_status = ?, safety_reason = ?, created_at = ?
                WHERE id = ? AND conversation_id = ? AND role = 'ASSISTANT'
                """, safeReply, model.intent(), json(sources), json(recommendations), model.safetyStatus(),
                blankToNull(model.safetyReason()), Timestamp.from(createdAt), existing.id(), conversationId);
        return new MessageView(
                existing.id(), conversationId, "ASSISTANT", safeReply, model.intent(), sources, recommendations,
                new SafetyView(model.safetyStatus(), model.safetyReason()), null, createdAt
        );
    }

    private ModelResult validateModelResult(
            ModelResult model,
            List<SourceCandidate> suppliedSources,
            List<ContentCandidate> catalog
    ) {
        Map<String, SourceCandidate> sources = suppliedSources.stream()
                .collect(Collectors.toMap(SourceCandidate::id, Function.identity(), (left, right) -> left));
        Map<String, ContentCandidate> contents = catalog.stream()
                .collect(Collectors.toMap(ContentCandidate::id, Function.identity(), (left, right) -> left));
        List<String> validSourceIds = model.sourceIds().stream().filter(sources::containsKey).distinct().limit(6).toList();
        List<ModelRecommendation> validRecommendations = model.recommendations().stream()
                .filter(item -> contents.containsKey(item.contentId()))
                .filter(distinctByContentId())
                .limit(4)
                .toList();
        if ("QUESTION".equals(model.intent()) && validSourceIds.isEmpty() && !statesInsufficientEvidence(model.reply())) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_SOURCE_VALIDATION_FAILED", "AI 回答缺少可核验来源，请重试");
        }
        return new ModelResult(
                model.reply(), model.intent(), validSourceIds, validRecommendations,
                model.safetyStatus(), model.safetyReason(), redactPrivacy(model.conversationSummary())
        );
    }

    private ModelResult applyPersonaReply(ModelResult model, boolean activationMessage) {
        if (!activationMessage) return model;
        return new ModelResult(
                ALICE_ACTIVATION_REPLY,
                "CHAT",
                List.of(),
                List.of(),
                "SAFE",
                "",
                model.conversationSummary()
        );
    }

    private java.util.function.Predicate<ModelRecommendation> distinctByContentId() {
        java.util.Set<String> seen = java.util.concurrent.ConcurrentHashMap.newKeySet();
        return item -> seen.add(item.contentId());
    }

    private boolean statesInsufficientEvidence(String reply) {
        String text = reply.toLowerCase(Locale.ROOT);
        return text.contains("未找到") || text.contains("没有可靠") || text.contains("资料不足")
                || text.contains("内容库不足") || text.contains("无法确认") || text.contains("insufficient");
    }

    private String buildContext(
            String operation,
            String userId,
            String conversationId,
            String summary,
            boolean memoryEnabled,
            List<MessageView> recentMessages,
            List<SourceCandidate> suppliedSources,
            List<ContentCandidate> catalog
    ) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("operation", operation);
        root.put("currentTime", TIME_FORMAT.format(Instant.now()));
        root.put("conversationId", conversationId);
        root.put("conversationSummary", nullToEmpty(summary));
        root.put("longTermMemoryAllowed", memoryEnabled);
        root.put("longTermMemory", memoryEnabled ? loadLongTermMemory(userId) : "");
        boolean alicePersona = hasAlicePersona(conversationId);
        ObjectNode persona = root.putObject("persona");
        persona.put("active", alicePersona);
        persona.put("activationMessage", latestUserMessageMatches(recentMessages, ALICE_TRIGGER));
        persona.put("activationReply", ALICE_ACTIVATION_REPLY);
        persona.put("styleVersion", "hidden-fairytale-companion-v2");
        persona.put("voiceProfile", "表层天真、亲近、柔和，底色冷静、疏离而神秘，偶尔显出令人轻微不安但不威胁用户的洞察；使用自然第二人称，避免客服腔、讲义腔、励志鸡汤、夸张卖萌和连续感叹号");
        persona.put("emotionalContrast", "同一句回复里可以让甜美与冷静、关心与若即若离并存，但不能恐吓、操控或把用户引向依赖；暗色童话感来自克制的观察和意象，不来自血腥、绝望或原作设定");
        persona.put("dialogueRhythm", "普通聊天优先一到三段紧凑文字，以短句和中等长度句为主；适度使用停顿、轻微反问和含蓄意象，每次最多点到为止；不堆叠修辞，不重复称呼用户，不默认列清单");
        persona.put("reasoningStyle", "先回答用户字面问题，再辨认话语里的矛盾、遗漏或真正顾虑；把已知、推测和未知分开，绝不把猜测说成事实；在身份、记忆、选择等话题中可以提出一个出人意料但相关的观察或精确反问；事实问题严格按证据推理，信息不足就坦白边界；不泛泛说教");
        persona.put("interactionStyle", "通常按‘直接回应—点出一个容易被忽略的矛盾或感受—必要时只留一个精确问题’组织回复；学习解答先清楚回答再保留语气，推荐说明与用户真实状态相关的理由；不要机械复述用户原话，不要反复表示自己会一直陪伴");
        persona.put("relationshipBoundary", "可以表达温暖、在意和陪伴感，但不诱导依赖，不要求保密，不贬低现实关系，不宣称唯一、永远占有或真实恋爱关系；遇到危险或未成年人安全问题立即回到清晰直接的安全表达");
        persona.put("copyrightBoundary", "仅采用抽象的暗色童话、温柔神秘、含蓄亲近等原创表达特征；不模仿或声称自己是任何现有作品角色，不复述、改写或拼接原作台词、身份、剧情、专有名词和世界观");
        root.set("profile", objectMapper.valueToTree(loadProfile(userId)));
        root.set("learningState", objectMapper.valueToTree(loadLearningState(userId)));

        ArrayNode messages = root.putArray("recentMessages");
        for (MessageView message : recentMessages) {
            messages.addObject()
                    .put("role", message.role())
                    .put("content", truncate(message.body(), 1800));
        }

        ArrayNode sources = root.putArray("suppliedSources");
        for (SourceCandidate source : suppliedSources) {
            sources.addObject()
                    .put("id", source.id())
                    .put("type", source.type())
                    .put("title", source.title())
                    .put("excerpt", truncate(source.excerpt(), 700))
                    .put("href", source.href());
        }

        ArrayNode candidates = root.putArray("catalogCandidates");
        for (ContentCandidate content : catalog) {
            candidates.addObject()
                    .put("contentId", content.id())
                    .put("title", content.title())
                    .put("summary", truncate(content.summary(), 500))
                    .put("type", content.type())
                    .put("category", content.categoryName())
                    .put("difficulty", content.difficulty())
                    .put("durationMinutes", content.durationMinutes())
                    .put("progressSeconds", content.progressSeconds())
                    .put("completed", content.completed())
                    .put("favorite", content.favorite())
                    .put("href", "/content/" + content.id());
        }
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception error) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "AI_CONTEXT_ENCODING_FAILED", "无法准备 AI 上下文");
        }
    }

    private boolean hasAlicePersona(String conversationId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM assistant_messages
                WHERE conversation_id = ? AND role = 'USER' AND body = ?
                """, Integer.class, conversationId, ALICE_TRIGGER);
        return count != null && count > 0;
    }

    private boolean latestUserMessageMatches(List<MessageView> messages, String expected) {
        for (int index = messages.size() - 1; index >= 0; index -= 1) {
            MessageView message = messages.get(index);
            if ("USER".equals(message.role())) return expected.equals(message.body());
        }
        return false;
    }

    private Map<String, Object> loadProfile(String userId) {
        return jdbc.query("""
                SELECT u.nickname, COALESCE(p.student_stage, 'GENERAL') AS student_stage,
                       COALESCE(p.reduce_motion, FALSE) AS reduce_motion
                FROM users u
                LEFT JOIN user_preferences p ON p.user_id = u.id
                WHERE u.id = ?
                """, rs -> {
            if (!rs.next()) throw notFound("用户不存在");
            Map<String, Object> profile = new LinkedHashMap<>();
            profile.put("nickname", rs.getString("nickname"));
            profile.put("studentStage", rs.getString("student_stage"));
            profile.put("reduceMotion", rs.getBoolean("reduce_motion"));
            return profile;
        }, userId);
    }

    private Map<String, Object> loadLearningState(String userId) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("recentViewing", jdbc.queryForList("""
                SELECT c.id AS content_id, c.title, h.progress_seconds, h.completed, h.last_viewed_at
                FROM viewing_history h
                JOIN contents c ON c.id = h.content_id
                WHERE h.user_id = ?
                ORDER BY h.last_viewed_at DESC
                LIMIT 6
                """, userId));
        state.put("favorites", jdbc.queryForList("""
                SELECT c.id AS content_id, c.title
                FROM favorites f
                JOIN contents c ON c.id = f.content_id
                WHERE f.user_id = ? AND c.status = 'PUBLISHED'
                ORDER BY f.created_at DESC
                LIMIT 6
                """, userId));
        state.put("unmasteredWrongAnswers", jdbc.queryForList("""
                SELECT content_id_snapshot AS content_id, content_title_snapshot AS title,
                       question_snapshot AS question, knowledge_tag_name_snapshot AS knowledge_tag
                FROM wrong_answers
                WHERE user_id = ? AND mastered_at IS NULL
                ORDER BY last_attempt_at DESC
                LIMIT 6
                """, userId));
        return state;
    }

    private List<SourceCandidate> loadSourceCandidates() {
        List<SourceCandidate> result = new ArrayList<>();
        result.addAll(jdbc.query("""
                SELECT c.id, c.title, c.summary, c.body, c.type, cat.name AS category_name
                FROM contents c
                JOIN categories cat ON cat.id = c.category_id
                WHERE c.status = 'PUBLISHED' AND c.review_status = 'APPROVED'
                ORDER BY c.is_core_course DESC, c.featured_weight DESC, c.published_at DESC, c.id
                LIMIT 24
                """, (rs, rowNum) -> new SourceCandidate(
                rs.getString("id"),
                "CONTENT",
                rs.getString("title"),
                joinExcerpt(rs.getString("summary"), rs.getString("body"), rs.getString("category_name")),
                "/content/" + rs.getString("id")
        )));
        result.addAll(jdbc.query("""
                SELECT q.id, r.title, r.body
                FROM community_questions q
                JOIN community_question_revisions r ON r.id = q.published_revision_id
                WHERE q.lifecycle_status = 'ACTIVE' AND r.safety_status = 'PUBLISHED'
                ORDER BY r.published_at DESC, q.id
                LIMIT 10
                """, (rs, rowNum) -> new SourceCandidate(
                rs.getString("id"),
                "COMMUNITY",
                rs.getString("title"),
                truncate(rs.getString("body"), 800),
                "/community/questions/" + rs.getString("id")
        )));
        return result;
    }

    private List<ContentCandidate> loadCatalog(String userId) {
        return jdbc.query("""
                SELECT c.id, c.title, c.summary, c.cover_url, c.type, cat.name AS category_name,
                       c.difficulty, c.duration_minutes, c.featured_weight,
                       COALESCE(h.progress_seconds, 0) AS progress_seconds,
                       COALESCE(h.completed, FALSE) AS completed,
                       CASE WHEN f.id IS NULL THEN FALSE ELSE TRUE END AS favorite
                FROM contents c
                JOIN categories cat ON cat.id = c.category_id
                LEFT JOIN viewing_history h ON h.content_id = c.id AND h.user_id = ?
                LEFT JOIN favorites f ON f.content_id = c.id AND f.user_id = ?
                WHERE c.status = 'PUBLISHED' AND c.review_status = 'APPROVED'
                  AND c.title IS NOT NULL AND c.summary IS NOT NULL
                  AND (c.type <> 'VIDEO' OR c.media_url IS NOT NULL OR EXISTS (
                      SELECT 1 FROM video_assets va WHERE va.content_id = c.id AND va.transcode_status = 'READY'
                  ))
                ORDER BY
                    CASE WHEN h.completed = FALSE AND h.progress_seconds > 0 THEN 0 ELSE 1 END,
                    CASE WHEN f.id IS NOT NULL THEN 0 ELSE 1 END,
                    c.featured_weight DESC,
                    c.published_at DESC,
                    c.id
                LIMIT 30
                """, (rs, rowNum) -> new ContentCandidate(
                rs.getString("id"),
                rs.getString("title"),
                rs.getString("summary"),
                rs.getString("cover_url"),
                rs.getString("type"),
                rs.getString("category_name"),
                rs.getString("difficulty"),
                rs.getInt("duration_minutes"),
                rs.getInt("progress_seconds"),
                rs.getBoolean("completed"),
                rs.getBoolean("favorite")
        ), userId, userId);
    }

    private void updateConversationAfterMessage(
            String userId,
            String conversationId,
            String userContent,
            String summary,
            boolean memoryEnabled
    ) {
        Integer userMessageCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM assistant_messages
                WHERE conversation_id = ? AND role = 'USER'
                """, Integer.class, conversationId);
        String title = userMessageCount != null && userMessageCount == 1
                ? truncate(userContent.replace('\n', ' '), 36)
                : null;
        if (title != null && !title.isBlank()) {
            jdbc.update("""
                    UPDATE assistant_conversations
                    SET title = ?, summary = ?, memory_enabled = ?, updated_at = ?
                    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
                    """, title, blankToNull(summary), memoryEnabled, Timestamp.from(Instant.now()), conversationId, userId);
        } else {
            jdbc.update("""
                    UPDATE assistant_conversations
                    SET summary = ?, memory_enabled = ?, updated_at = ?
                    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
                    """, blankToNull(summary), memoryEnabled, Timestamp.from(Instant.now()), conversationId, userId);
        }
    }

    private void persistMemory(String userId, String summary, boolean enabled) {
        List<String> ids = jdbc.query("SELECT id FROM assistant_memory WHERE user_id = ? AND memory_key = 'conversation-summary'",
                (rs, rowNum) -> rs.getString("id"), userId);
        if (!enabled || summary == null || summary.isBlank()) {
            if (!ids.isEmpty()) {
                jdbc.update("UPDATE assistant_memory SET enabled = FALSE, updated_at = ? WHERE id = ?",
                        Timestamp.from(Instant.now()), ids.get(0));
            }
            return;
        }
        Instant now = Instant.now();
        if (ids.isEmpty()) {
            jdbc.update("""
                    INSERT INTO assistant_memory
                        (id, user_id, memory_key, content, enabled, consented_at, created_at, updated_at)
                    VALUES (?, ?, 'conversation-summary', ?, TRUE, ?, ?, ?)
                    """, UUID.randomUUID().toString(), userId, truncate(redactPrivacy(summary), 2000),
                    Timestamp.from(now), Timestamp.from(now), Timestamp.from(now));
        } else {
            jdbc.update("""
                    UPDATE assistant_memory
                    SET content = ?, enabled = TRUE, consented_at = COALESCE(consented_at, ?), updated_at = ?
                    WHERE id = ?
                    """, truncate(redactPrivacy(summary), 2000), Timestamp.from(now), Timestamp.from(now), ids.get(0));
        }
    }

    private String loadLongTermMemory(String userId) {
        return jdbc.query("""
                SELECT content
                FROM assistant_memory
                WHERE user_id = ? AND memory_key = 'conversation-summary' AND enabled = TRUE
                ORDER BY updated_at DESC
                LIMIT 1
                """, (rs, rowNum) -> rs.getString("content"), userId)
                .stream().findFirst().map(value -> truncate(redactPrivacy(value), 2000)).orElse("");
    }

    private MessageView messageView(ResultSet rs) throws SQLException {
        return new MessageView(
                rs.getString("id"),
                rs.getString("conversation_id"),
                rs.getString("role"),
                rs.getString("body"),
                rs.getString("intent"),
                parseSources(rs.getString("sources_json")),
                parseRecommendations(rs.getString("recommendations_json")),
                new SafetyView(rs.getString("safety_status"), nullToEmpty(rs.getString("safety_reason"))),
                rs.getString("request_id"),
                instant(rs, "created_at")
        );
    }

    private List<SourceView> parseSources(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<SourceView> result = new ArrayList<>();
            for (JsonNode node : objectMapper.readTree(json)) {
                result.add(new SourceView(
                        node.path("id").asText(), node.path("type").asText(), node.path("title").asText(),
                        node.path("excerpt").asText(), node.path("href").asText()
                ));
            }
            return result;
        } catch (Exception error) {
            return List.of();
        }
    }

    private List<RecommendationView> parseRecommendations(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<RecommendationView> result = new ArrayList<>();
            for (JsonNode node : objectMapper.readTree(json)) {
                result.add(new RecommendationView(
                        node.path("contentId").asText(), node.path("title").asText(), node.path("summary").asText(),
                        node.path("coverUrl").asText(null), node.path("contentType").asText(),
                        node.path("categoryName").asText(), node.path("difficulty").asText(),
                        node.path("durationMinutes").asInt(), node.path("reason").asText(), node.path("href").asText()
                ));
            }
            return result;
        } catch (Exception error) {
            return List.of();
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception error) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ASSISTANT_SERIALIZATION_FAILED", "无法保存 AI 消息");
        }
    }

    private void requireUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "请先登录");
        }
    }

    private void enforceRateLimit(String userId) {
        long now = System.currentTimeMillis();
        Deque<Long> window = requestWindows.computeIfAbsent(userId, ignored -> new ArrayDeque<>());
        synchronized (window) {
            while (!window.isEmpty() && now - window.peekFirst() >= 60_000) window.removeFirst();
            if (window.size() >= RATE_LIMIT_PER_MINUTE) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ASSISTANT_RATE_LIMITED", "发送得有点快，请稍后再试");
            }
            window.addLast(now);
        }
    }

    private String sanitizeUserContent(String value) {
        String text = value == null ? "" : value.trim();
        if (text.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "ASSISTANT_MESSAGE_EMPTY", "请输入消息");
        if (text.length() > 2000) throw new ApiException(HttpStatus.BAD_REQUEST, "ASSISTANT_MESSAGE_TOO_LONG", "消息不能超过 2000 字");
        return redactPrivacy(text);
    }

    private String redactPrivacy(String value) {
        if (value == null || value.isBlank()) return nullToEmpty(value);
        String redacted = EMAIL.matcher(value).replaceAll("[邮箱已隐藏]");
        redacted = MOBILE.matcher(redacted).replaceAll("[手机号已隐藏]");
        redacted = CONTACT_ACCOUNT.matcher(redacted).replaceAll("[联系方式已隐藏]");
        return LONG_NUMBER.matcher(redacted).replaceAll("[敏感号码已隐藏]");
    }

    private String ruleReason(ContentCandidate candidate) {
        if (candidate.progressSeconds() > 0 && !candidate.completed()) return "继续你尚未完成的真实课程";
        if (candidate.favorite()) return "来自你的收藏";
        return "当前内容库中的已发布课程";
    }

    private String joinExcerpt(String summary, String body, String category) {
        StringBuilder text = new StringBuilder();
        if (category != null && !category.isBlank()) text.append("分类：").append(category).append("。 ");
        if (summary != null && !summary.isBlank()) text.append(summary.trim());
        if (body != null && !body.isBlank()) text.append(" ").append(body.trim());
        return truncate(text.toString(), 900);
    }

    private String truncate(String value, int max) {
        String text = value == null ? "" : value.trim();
        return text.length() <= max ? text : text.substring(0, max);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "ASSISTANT_NOT_FOUND", message);
    }

    private record ConversationRow(String id, String summary, boolean memoryEnabled) {
    }

    private record SourceCandidate(String id, String type, String title, String excerpt, String href) {
        SourceView toView() {
            return new SourceView(id, type, title, excerpt, href);
        }
    }

    private record ContentCandidate(
            String id,
            String title,
            String summary,
            String coverUrl,
            String type,
            String categoryName,
            String difficulty,
            int durationMinutes,
            int progressSeconds,
            boolean completed,
            boolean favorite
    ) {
        RecommendationView toRecommendation(String reason) {
            return new RecommendationView(
                    id, title, summary, coverUrl, type, categoryName, difficulty,
                    durationMinutes, reason, "/content/" + id
            );
        }
    }
}
