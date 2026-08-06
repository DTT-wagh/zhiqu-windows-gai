package com.zhiqu.server.chat;

import com.zhiqu.server.social.SocialService;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/chat")
public class PrivateChatController {
    private final JdbcTemplate jdbc;
    private final SocialService social;

    public PrivateChatController(JdbcTemplate jdbc, SocialService social) {
        this.jdbc = jdbc;
        this.social = social;
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

    @GetMapping("/conversations")
    public List<Map<String, Object>> conversations(Authentication authentication) {
        String currentUserId = currentUser(authentication);
        return jdbc.query(
                """
                SELECT c.id, u.id AS partner_id, u.username, u.nickname,
                       sp.public_profile_id, sp.avatar_key, c.updated_at,
                       c.status, c.requested_by_id,
                       (SELECT m.body FROM chat_messages m
                        WHERE m.conversation_id = c.id
                        ORDER BY m.created_at DESC LIMIT 1) AS last_body,
                       (SELECT m.created_at FROM chat_messages m
                        WHERE m.conversation_id = c.id
                        ORDER BY m.created_at DESC LIMIT 1) AS last_at,
                       (SELECT COUNT(*) FROM chat_messages unread
                        WHERE unread.conversation_id = c.id
                          AND unread.sender_id = u.id
                          AND unread.read_at IS NULL) AS unread_count
                FROM chat_conversations c
                JOIN users u ON u.id = CASE WHEN c.user_low_id = ? THEN c.user_high_id ELSE c.user_low_id END
                LEFT JOIN social_profiles sp ON sp.user_id = u.id
                WHERE c.user_low_id = ? OR c.user_high_id = ?
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
                    result.put("requestedBy", rs.getString("requested_by_id"));
                    result.put("isFriend", isFriendshipActive(currentUserId, rs.getString("partner_id")));
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
        Map<String, String> conversation = findConversation(currentUserId, partnerId);
        if (conversation == null) return List.of();
        String conversationId = conversation.get("id");

        int boundedLimit = Math.max(1, Math.min(limit, 100));
        List<Map<String, Object>> messages = jdbc.query(
                "SELECT id, sender_id, body, created_at, read_at FROM chat_messages "
                        + "WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
                ps -> {
                    ps.setString(1, conversationId);
                    ps.setInt(2, boundedLimit);
                },
                (rs, row) -> {
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("id", rs.getString("id"));
                    result.put("senderId", rs.getString("sender_id"));
                    result.put("body", rs.getString("body"));
                    result.put("createdAt", instantValue(rs.getTimestamp("created_at")));
                    result.put("readAt", instantValue(rs.getTimestamp("read_at")));
                    return result;
                });
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
        String body = request == null || request.body() == null ? "" : request.body().trim();
        if (body.isBlank() || body.length() > 2000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "消息需为 1-2000 个字符");
        }
        String stickerKey = stickerKeyFromBody(body);
        if (stickerKey != null) {
            Integer stickerCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM chat_stickers WHERE owner_id = ? AND storage_key = ?",
                    Integer.class, currentUserId, stickerKey);
            if (stickerCount == null || stickerCount == 0) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "只能发送自己收藏的图片表情");
            }
        }

        boolean friend = isFriendshipActive(currentUserId, partnerId);
        Map<String, String> conversation = findOrCreateConversation(currentUserId, partnerId, friend);
        String status = conversation.get("status");
        if (friend && !"ACCEPTED".equals(status)) {
            jdbc.update("UPDATE chat_conversations SET status = 'ACCEPTED', requested_by_id = NULL WHERE id = ?",
                    conversation.get("id"));
            status = "ACCEPTED";
        }
        if ("DECLINED".equals(status)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "对方暂时无法接收消息");
        }
        if (!friend) {
            Integer outgoingCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM chat_messages WHERE conversation_id = ? AND sender_id = ?",
                    Integer.class, conversation.get("id"), currentUserId);
            if (outgoingCount != null && outgoingCount >= 3) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "陌生人私聊最多发送 3 条消息，请先添加笔友");
            }
        }
        if ("REQUESTED".equals(status)) {
            if (!currentUserId.equals(conversation.get("requestedById"))) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "请等待对方接受聊天请求");
            }
        }
        String conversationId = conversation.get("id");
        String messageId = UUID.randomUUID().toString();
        Instant createdAt = Instant.now();
        jdbc.update(
                "INSERT INTO chat_messages (id, conversation_id, sender_id, body, created_at, read_at) "
                        + "VALUES (?, ?, ?, ?, ?, NULL)",
                messageId, conversationId, currentUserId, body, Timestamp.from(createdAt));
        jdbc.update("UPDATE chat_conversations SET updated_at = ? WHERE id = ?",
                Timestamp.from(createdAt), conversationId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", messageId);
        result.put("conversationId", conversationId);
        result.put("senderId", currentUserId);
        result.put("body", body);
        result.put("createdAt", createdAt.toString());
        result.put("readAt", null);
        return result;
    }

    @PostMapping("/conversations/{partnerId}/read")
    public Map<String, Object> markRead(
            @PathVariable(name = "partnerId") String partnerId,
        Authentication authentication) {
        String currentUserId = currentUser(authentication);
        ensureChatTarget(currentUserId, partnerId);
        Map<String, String> conversation = findConversation(currentUserId, partnerId);
        int updated = conversation == null ? 0 : jdbc.update(
                "UPDATE chat_messages SET read_at = CURRENT_TIMESTAMP "
                        + "WHERE conversation_id = ? AND sender_id = ? AND read_at IS NULL",
                conversation.get("id"), partnerId);
        return Map.of("updated", updated);
    }

    @PostMapping("/conversations/{partnerId}/accept")
    public Map<String, Object> acceptConversation(
            @PathVariable(name = "partnerId") String partnerId,
            Authentication authentication) {
        String currentUserId = currentUser(authentication);
        ensureChatTarget(currentUserId, partnerId);
        Map<String, String> conversation = findConversation(currentUserId, partnerId);
        if (conversation == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "聊天请求不存在");
        }
        String status = conversation.get("status");
        if ("DECLINED".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "聊天请求已被暂不接受");
        }
        if ("REQUESTED".equals(status)) {
            if (currentUserId.equals(conversation.get("requestedById"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不能接受自己发起的聊天请求");
            }
            jdbc.update("UPDATE chat_conversations SET status = 'ACCEPTED', requested_by_id = NULL WHERE id = ?",
                    conversation.get("id"));
        }
        return conversationView(conversation.get("id"), "ACCEPTED", null);
    }

    @PostMapping("/conversations/{partnerId}/decline")
    public Map<String, Object> declineConversation(
            @PathVariable(name = "partnerId") String partnerId,
            Authentication authentication) {
        String currentUserId = currentUser(authentication);
        ensureChatTarget(currentUserId, partnerId);
        Map<String, String> conversation = findConversation(currentUserId, partnerId);
        if (conversation == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "聊天请求不存在");
        }
        if ("ACCEPTED".equals(conversation.get("status"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "聊天已经开启");
        }
        if ("REQUESTED".equals(conversation.get("status"))
                && currentUserId.equals(conversation.get("requestedById"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不能拒绝自己发起的聊天请求");
        }
        jdbc.update("UPDATE chat_conversations SET status = 'DECLINED' WHERE id = ?", conversation.get("id"));
        return conversationView(conversation.get("id"), "DECLINED", conversation.get("requestedById"));
    }

    public record SendMessageRequest(String body, UUID requestId) {}

    private String currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录");
        }
        return authentication.getName();
    }

    private void ensureChatTarget(String currentUserId, String partnerId) {
        if (partnerId == null || partnerId.isBlank() || currentUserId.equals(partnerId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "聊天对象无效");
        }
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ? AND status = 'ACTIVE'",
                Integer.class, partnerId);
        if (count == null || count == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "聊天对象不存在");
        }
    }

    private Map<String, String> findConversation(String currentUserId, String partnerId) {
        List<Map<String, String>> conversations = jdbc.query(
                "SELECT id, status, requested_by_id FROM chat_conversations WHERE user_low_id = ? AND user_high_id = ?",
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

    private Map<String, String> findOrCreateConversation(String currentUserId, String partnerId, boolean friend) {
        Map<String, String> existing = findConversation(currentUserId, partnerId);
        if (existing != null) return existing;
        String id = UUID.randomUUID().toString();
        try {
            jdbc.update(
                    "INSERT INTO chat_conversations (id, user_low_id, user_high_id, created_at, updated_at, status, requested_by_id) "
                            + "VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)",
                    id, low(currentUserId, partnerId), high(currentUserId, partnerId),
                    friend ? "ACCEPTED" : "REQUESTED", friend ? null : currentUserId);
            return findConversation(currentUserId, partnerId);
        } catch (RuntimeException duplicate) {
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

    private Map<String, Object> conversationView(String conversationId, String status, String requestedBy) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("conversationId", conversationId);
        result.put("status", status);
        result.put("requestedBy", requestedBy);
        return result;
    }

    private static String low(String first, String second) {
        return first.compareTo(second) < 0 ? first : second;
    }

    private static String high(String first, String second) {
        return first.compareTo(second) < 0 ? second : first;
    }

    private static String stickerKeyFromBody(String body) {
        String prefix = "[[zq-sticker:";
        if (!body.startsWith(prefix) || !body.endsWith("]]")) return null;
        String key = body.substring(prefix.length(), body.length() - 2);
        return key.matches("[0-9a-fA-F]{32}\\.(jpg|jpeg|png|gif|webp)") ? key : null;
    }

    private static String instantValue(Timestamp value) {
        return value == null ? null : value.toInstant().toString();
    }
}
