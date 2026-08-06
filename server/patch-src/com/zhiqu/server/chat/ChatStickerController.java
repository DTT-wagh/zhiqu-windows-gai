package com.zhiqu.server.chat;

import com.zhiqu.server.config.MediaProperties;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/chat/stickers")
public class ChatStickerController {
    private final JdbcTemplate jdbc;
    private final Path imageDirectory;

    public ChatStickerController(JdbcTemplate jdbc, MediaProperties mediaProperties) {
        this.jdbc = jdbc;
        this.imageDirectory = Path.of(mediaProperties.root())
                .toAbsolutePath()
                .normalize()
                .resolve("community-answer-images");
    }

    @GetMapping
    public List<Map<String, Object>> list(Authentication authentication) {
        String userId = currentUser(authentication);
        return jdbc.query(
                "SELECT storage_key, created_at FROM chat_stickers WHERE owner_id = ? ORDER BY created_at DESC",
                ps -> ps.setString(1, userId),
                (rs, row) -> {
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("key", rs.getString("storage_key"));
                    Timestamp createdAt = rs.getTimestamp("created_at");
                    result.put("createdAt", createdAt == null ? null : createdAt.toInstant().toString());
                    return result;
                });
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> add(
            @RequestBody AddStickerRequest request,
            Authentication authentication) {
        String userId = currentUser(authentication);
        String key = request == null || request.key() == null ? "" : request.key().trim();
        if (!validKey(key)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "图片表情地址无效");
        }

        Path image = imageDirectory.resolve(key).normalize();
        if (!image.startsWith(imageDirectory) || !Files.isRegularFile(image)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "图片表情不存在");
        }

        Instant createdAt = Instant.now();
        try {
            jdbc.update(
                    "INSERT INTO chat_stickers (id, owner_id, storage_key, created_at) VALUES (?, ?, ?, ?)",
                    UUID.randomUUID().toString(), userId, key, Timestamp.from(createdAt));
        } catch (DataIntegrityViolationException duplicate) {
            jdbc.update(
                    "UPDATE chat_stickers SET created_at = ? WHERE owner_id = ? AND storage_key = ?",
                    Timestamp.from(createdAt), userId, key);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("key", key);
        result.put("createdAt", createdAt.toString());
        return result;
    }

    public record AddStickerRequest(String key) {}

    private static String currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录");
        }
        return authentication.getName();
    }

    private static boolean validKey(String key) {
        return key.matches("[0-9a-fA-F]{32}\\.(jpg|jpeg|png|gif|webp)");
    }
}
