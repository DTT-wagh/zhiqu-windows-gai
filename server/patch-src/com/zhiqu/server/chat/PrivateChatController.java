package com.zhiqu.server.chat;

import com.zhiqu.server.common.ApiException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chat")
public class PrivateChatController {
    private static final int MAX_MESSAGE_CODE_POINTS = 500;
    private static final String CHAT_REQUIRES_FRIENDSHIP = "双方成为好友后才能聊天";
    private static final Pattern PHONE_PATTERN = Pattern.compile(
            "(?<!\\d)(?:\\+?86[ -]?)?1[3-9]\\d(?:[ -]?\\d){8}(?!\\d)");
    private static final Pattern QQ_PATTERN = Pattern.compile(
            "(?i)(?:(?:q\\s*q|扣扣|企鹅)\\s*(?:号|号码|[:：是为-])?\\s*)?[1-9]\\d{4,11}");
    private static final Pattern WECHAT_PATTERN = Pattern.compile(
            "(?i)(?:微信|微\\s*信|v\\s*信|vx|wx)\\s*(?:号|号码|[:：是为-])?\\s*[a-z][-_a-z0-9]{5,19}");
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "(?i)(?<![a-z0-9._%+-])[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}(?![a-z0-9._%+-])");
    private static final Pattern ADDRESS_PATTERN = Pattern.compile(
            "(?:地址|住址|我家在|我住在|住在|学校在|学校地址)\\s*[:：是为]?\\s*.{2,}"
                    + "|(?:省|市|自治区|区|县|镇|乡|街道|路|巷|小区).{0,24}(?:号|栋|幢|单元|室)",
            Pattern.DOTALL);

    private final JdbcTemplate jdbc;

    public PrivateChatController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> searchUsers(
            @RequestParam(name = "q", defaultValue = "") String q,
            Authentication authentication) {
        String currentUserId = currentUser(authentication);
        String query = q == null ? "" : q.trim();
        if (query.length() < 2) return List.of();
        String pattern = "%" + query.toLowerCase() + "%";
        return jdbc.query(
                """
                SELECT u.id, u.username, u.nickname, sp.public_profile_id, sp.avatar_key
                FROM users u
                LEFT JOIN social_profiles sp ON sp.user_id = u.id
                WHERE u.id <> ? AND u.status = 'ACTIVE'
                  AND (LOWER(u.username) LIKE ? OR LOWER(u.nickname) LIKE ?)
                ORDER BY CASE WHEN LOWER(u.username) = ? THEN 0
                              WHEN LOWER(u.nickname) = ? THEN 1 ELSE 2 END,
                         u.nickname, u.username
                LIMIT 20
                """,
                ps -> {
                    ps.setString(1, currentUserId);
                    ps.setString(2, pattern);
                    ps.setString(3, pattern);
                    ps.setString(4, query.toLowerCase());
                    ps.setString(5, query.toLowerCase());
                },
                (rs, row) -> {
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("id", rs.getString("id"));
                    result.put("username", rs.getString("username"));
                    result.put("nickname", rs.getString("nickname"));
                    result.put("publicProfileId", rs.getString("public_profile_id"));
                    result.put("avatarKey", rs.getString("avatar_key"));
                    return result;
                });
    }

    @GetMapping("/friends/by-profile/{publicProfileId}")
    public Map<String, Object> friendByPublicProfileId(
            @PathVariable(name = "publicProfileId") String publicProfileId,
            Authentication authentication) {
        String currentUserId = currentUser(authentication);
        List<Map<String, Object>> friends = jdbc.query(
                """
                SELECT u.id, u.username, u.nickname, sp.public_profile_id, sp.avatar_key
                FROM social_profiles sp
                JOIN users u ON u.id = sp.user_id AND u.status = 'ACTIVE'
                JOIN friendships f ON f.status = 'ACTIVE'
                  AND ((f.user_low_id = ? AND f.user_high_id = u.id)
                    OR (f.user_high_id = ? AND f.user_low_id = u.id))
                WHERE sp.public_profile_id = ?
                """,
                ps -> {
                    ps.setString(1, currentUserId);
                    ps.setString(2, currentUserId);
                    ps.setString(3, publicProfileId);
                },
                (rs, row) -> {
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("id", rs.getString("id"));
                    result.put("username", rs.getString("username"));
                    result.put("nickname", rs.getString("nickname"));
                    result.put("publicProfileId", rs.getString("public_profile_id"));
                    result.put("avatarKey", rs.getString("avatar_key"));
                    return result;
                });
        if (friends.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CHAT_FRIEND_NOT_FOUND", "未找到这位笔友");
        }
        return friends.get(0);
    }

    @GetMapping("/conversations")
    public List<Map<String, Object>> conversations(Authentication authentication) {
        String currentUserId = currentUser(authentication);
        return jdbc.query(
                """
                SELECT c.id, u.id AS partner_id, u.username, u.nickname,
                       sp.public_profile_id, sp.avatar_key, c.updated_at,
                       c.status,
                       (SELECT m.body FROM chat_messages m
                        WHERE m.conversation_id = c.id AND m.status = 'APPROVED'
                        ORDER BY m.created_at DESC LIMIT 1) AS last_body,
                       (SELECT m.created_at FROM chat_messages m
                        WHERE m.conversation_id = c.id AND m.status = 'APPROVED'
                        ORDER BY m.created_at DESC LIMIT 1) AS last_at,
                       (SELECT COUNT(*) FROM chat_messages unread
                        WHERE unread.conversation_id = c.id
                          AND unread.sender_id = u.id
                          AND unread.status = 'APPROVED'
                          AND unread.read_at IS NULL) AS unread_count
                FROM chat_conversations c
                JOIN friendships f ON f.user_low_id = c.user_low_id
                                  AND f.user_high_id = c.user_high_id
                                  AND f.status = 'ACTIVE'
                JOIN users u ON u.id = CASE WHEN c.user_low_id = ? THEN c.user_high_id ELSE c.user_low_id END
                LEFT JOIN social_profiles sp ON sp.user_id = u.id
                WHERE (c.user_low_id = ? OR c.user_high_id = ?)
                  AND c.status = 'ACCEPTED'
                ORDER BY c.updated_at DESC
                """,
                ps -> {
                    ps.setString(1, currentUserId);
                    ps.setString(2, currentUserId);
                    ps.setString(3, currentUserId);
                },
                (rs, row) -> {
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("id", rs.getString("id"));
                    result.put("partnerId", rs.getString("partner_id"));
                    result.put("username", rs.getString("username"));
                    result.put("nickname", rs.getString("nickname"));
                    result.put("publicProfileId", rs.getString("public_profile_id"));
                    result.put("avatarKey", rs.getString("avatar_key"));
                    result.put("status", rs.getString("status"));
                    result.put("requestedBy", null);
                    result.put("isFriend", true);
                    result.put("lastMessage", rs.getString("last_body"));
                    result.put("lastAt", instantValue(rs.getTimestamp("last_at")));
                    result.put("unreadCount", rs.getInt("unread_count"));
                    return result;
                });
    }

    @GetMapping("/conversations/{partnerId}/messages")
    public List<Map<String, Object>> messages(
            @PathVariable(name = "partnerId") String partnerId,
            @RequestParam(name = "limit", defaultValue = "50") int limit,
            Authentication authentication) {
        String currentUserId = currentUser(authentication);
        ensureChatTarget(currentUserId, partnerId);
        requireFriendship(currentUserId, partnerId);
        Map<String, String> conversation = findAcceptedConversation(currentUserId, partnerId);
        if (conversation == null) return List.of();

        int boundedLimit = Math.max(1, Math.min(limit, 100));
        List<Map<String, Object>> messages = jdbc.query(
                "SELECT id, sender_id, body, status, created_at, read_at FROM chat_messages "
                        + "WHERE conversation_id = ? AND status = 'APPROVED' "
                        + "ORDER BY created_at DESC LIMIT ?",
                ps -> {
                    ps.setString(1, conversation.get("id"));
                    ps.setInt(2, boundedLimit);
                },
                (rs, row) -> messageView(
                        rs.getString("id"),
                        conversation.get("id"),
                        rs.getString("sender_id"),
                        rs.getString("body"),
                        rs.getString("status"),
                        rs.getTimestamp("created_at"),
                        rs.getTimestamp("read_at")));
        List<Map<String, Object>> ordered = new ArrayList<>(messages);
        java.util.Collections.reverse(ordered);
        return ordered;
    }

    @PostMapping("/conversations/{partnerId}/messages")
    public Map<String, Object> sendMessage(
            @PathVariable(name = "partnerId") String partnerId,
            @RequestBody SendMessageRequest request,
            Authentication authentication) {
        String currentUserId = currentUser(authentication);
        ensureChatTarget(currentUserId, partnerId);
        requireFriendship(currentUserId, partnerId);

        UUID requestId = request == null ? null : request.requestId();
        if (requestId != null) {
            Map<String, Object> existing = findMessageByRequestId(currentUserId, requestId.toString());
            if (existing != null) return existing;
        }

        String body = request == null || request.body() == null ? "" : request.body().trim();
        if (body.isBlank() || body.codePointCount(0, body.length()) > MAX_MESSAGE_CODE_POINTS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CHAT_MESSAGE_INVALID", "消息需为 1-500 个字符");
        }
        if (body.startsWith("[[zq-sticker:")) {
            throw new ApiException(HttpStatus.FORBIDDEN, "CHAT_CUSTOM_STICKER_DISABLED", "儿童版暂不支持用户图片表情");
        }
        String sensitiveType = sensitiveInformationType(body);
        if (sensitiveType != null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CHAT_SENSITIVE_INFORMATION",
                    "消息包含" + sensitiveType + "，不能发送个人联系方式或地址");
        }

        Map<String, String> conversation = findOrCreateAcceptedConversation(currentUserId, partnerId);
        String conversationId = conversation.get("id");
        String messageId = UUID.randomUUID().toString();
        Instant createdAt = Instant.now();
        try {
            jdbc.update(
                    "INSERT INTO chat_messages "
                            + "(id, conversation_id, sender_id, body, request_id, status, created_at, read_at) "
                            + "VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, NULL)",
                    messageId, conversationId, currentUserId, body,
                    requestId == null ? null : requestId.toString(), Timestamp.from(createdAt));
        } catch (DataIntegrityViolationException duplicate) {
            if (requestId != null) {
                Map<String, Object> existing = findMessageByRequestId(currentUserId, requestId.toString());
                if (existing != null) return existing;
                throw new ApiException(HttpStatus.CONFLICT, "CHAT_REQUEST_ID_CONFLICT", "requestId 已被使用");
            }
            throw duplicate;
        }
        jdbc.update("UPDATE chat_conversations SET updated_at = ? WHERE id = ?",
                Timestamp.from(createdAt), conversationId);
        return messageView(messageId, conversationId, currentUserId, body, "APPROVED",
                Timestamp.from(createdAt), null);
    }

    @PostMapping("/conversations/{partnerId}/read")
    public Map<String, Object> markRead(
            @PathVariable(name = "partnerId") String partnerId,
            Authentication authentication) {
        String currentUserId = currentUser(authentication);
        ensureChatTarget(currentUserId, partnerId);
        requireFriendship(currentUserId, partnerId);
        Map<String, String> conversation = findAcceptedConversation(currentUserId, partnerId);
        int updated = conversation == null ? 0 : jdbc.update(
                "UPDATE chat_messages SET read_at = CURRENT_TIMESTAMP "
                        + "WHERE conversation_id = ? AND sender_id = ? "
                        + "AND status = 'APPROVED' AND read_at IS NULL",
                conversation.get("id"), partnerId);
        return Map.of("updated", updated);
    }

    @PostMapping("/conversations/{partnerId}/accept")
    public Map<String, Object> acceptConversation(
            @PathVariable(name = "partnerId") String partnerId,
            Authentication authentication) {
        currentUser(authentication);
        throw new ApiException(HttpStatus.FORBIDDEN, "CHAT_REQUEST_DISABLED", "请通过好友申请建立好友关系后再聊天");
    }

    @PostMapping("/conversations/{partnerId}/decline")
    public Map<String, Object> declineConversation(
            @PathVariable(name = "partnerId") String partnerId,
            Authentication authentication) {
        currentUser(authentication);
        throw new ApiException(HttpStatus.FORBIDDEN, "CHAT_REQUEST_DISABLED", "聊天请求功能已关闭，请使用好友申请");
    }

    public record SendMessageRequest(String body, UUID requestId) {}

    private String currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "请先登录");
        }
        return authentication.getName();
    }

    private void ensureChatTarget(String currentUserId, String partnerId) {
        if (partnerId == null || partnerId.isBlank() || currentUserId.equals(partnerId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CHAT_TARGET_INVALID", "聊天对象无效");
        }
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ? AND status = 'ACTIVE'",
                Integer.class, partnerId);
        if (count == null || count == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "CHAT_TARGET_NOT_FOUND", "聊天对象不存在");
        }
    }

    private void requireFriendship(String currentUserId, String partnerId) {
        if (!isFriendshipActive(currentUserId, partnerId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "CHAT_FRIENDSHIP_REQUIRED", CHAT_REQUIRES_FRIENDSHIP);
        }
    }

    private Map<String, String> findConversation(String currentUserId, String partnerId) {
        List<Map<String, String>> conversations = jdbc.query(
                "SELECT id, status, requested_by_id FROM chat_conversations "
                        + "WHERE user_low_id = ? AND user_high_id = ?",
                ps -> {
                    ps.setString(1, low(currentUserId, partnerId));
                    ps.setString(2, high(currentUserId, partnerId));
                },
                (rs, row) -> {
                    Map<String, String> result = new LinkedHashMap<>();
                    result.put("id", rs.getString("id"));
                    result.put("status", rs.getString("status"));
                    result.put("requestedById", rs.getString("requested_by_id"));
                    return result;
                });
        return conversations.isEmpty() ? null : conversations.get(0);
    }

    private Map<String, String> findAcceptedConversation(String currentUserId, String partnerId) {
        Map<String, String> conversation = findConversation(currentUserId, partnerId);
        return conversation != null && "ACCEPTED".equals(conversation.get("status")) ? conversation : null;
    }

    private Map<String, String> findOrCreateAcceptedConversation(String currentUserId, String partnerId) {
        Map<String, String> existing = findConversation(currentUserId, partnerId);
        if (existing != null) {
            if (!"ACCEPTED".equals(existing.get("status"))) {
                jdbc.update("UPDATE chat_conversations "
                                + "SET status = 'ACCEPTED', requested_by_id = NULL, updated_at = CURRENT_TIMESTAMP "
                                + "WHERE id = ?",
                        existing.get("id"));
                return findConversation(currentUserId, partnerId);
            }
            return existing;
        }

        String id = UUID.randomUUID().toString();
        try {
            jdbc.update(
                    "INSERT INTO chat_conversations "
                            + "(id, user_low_id, user_high_id, created_at, updated_at, status, requested_by_id) "
                            + "VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'ACCEPTED', NULL)",
                    id, low(currentUserId, partnerId), high(currentUserId, partnerId));
            return findConversation(currentUserId, partnerId);
        } catch (DataIntegrityViolationException duplicate) {
            Map<String, String> retry = findConversation(currentUserId, partnerId);
            if (retry != null) return retry;
            throw duplicate;
        }
    }

    private boolean isFriendshipActive(String currentUserId, String partnerId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM friendships WHERE status = 'ACTIVE' AND "
                        + "((user_low_id = ? AND user_high_id = ?) OR (user_low_id = ? AND user_high_id = ?))",
                Integer.class, currentUserId, partnerId, partnerId, currentUserId);
        return count != null && count > 0;
    }

    private Map<String, Object> findMessageByRequestId(String senderId, String requestId) {
        List<Map<String, Object>> messages = jdbc.query(
                "SELECT id, conversation_id, sender_id, body, status, created_at, read_at "
                        + "FROM chat_messages WHERE sender_id = ? AND request_id = ?",
                ps -> {
                    ps.setString(1, senderId);
                    ps.setString(2, requestId);
                },
                (rs, row) -> messageView(
                        rs.getString("id"),
                        rs.getString("conversation_id"),
                        rs.getString("sender_id"),
                        rs.getString("body"),
                        rs.getString("status"),
                        rs.getTimestamp("created_at"),
                        rs.getTimestamp("read_at")));
        return messages.isEmpty() ? null : messages.get(0);
    }

    private static Map<String, Object> messageView(
            String id,
            String conversationId,
            String senderId,
            String body,
            String status,
            Timestamp createdAt,
            Timestamp readAt) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("conversationId", conversationId);
        result.put("senderId", senderId);
        result.put("body", body);
        result.put("status", status);
        result.put("createdAt", instantValue(createdAt));
        result.put("readAt", instantValue(readAt));
        return result;
    }

    private static String sensitiveInformationType(String body) {
        if (PHONE_PATTERN.matcher(body).find()) return "手机号码";
        if (EMAIL_PATTERN.matcher(body).find()) return "邮箱";
        if (WECHAT_PATTERN.matcher(body).find()) return "微信号";
        if (QQ_PATTERN.matcher(body).find()) return "QQ号码";
        if (ADDRESS_PATTERN.matcher(body).find()) return "地址信息";
        return null;
    }

    private static String low(String first, String second) {
        return first.compareTo(second) < 0 ? first : second;
    }

    private static String high(String first, String second) {
        return first.compareTo(second) < 0 ? second : first;
    }

    private static String instantValue(Timestamp value) {
        return value == null ? null : value.toInstant().toString();
    }
}
