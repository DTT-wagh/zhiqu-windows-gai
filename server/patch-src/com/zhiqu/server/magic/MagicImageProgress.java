package com.zhiqu.server.magic;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory stage progress for the background image provider call. */
public final class MagicImageProgress {
    private static final long RETENTION_MILLIS = 30 * 60 * 1_000L;
    private static final Map<String, Snapshot> STATES = new ConcurrentHashMap<>();

    private MagicImageProgress() {
    }

    public static void update(String roomId, String status, int progress, String message) {
        String id = normalize(roomId);
        if (id.isBlank()) return;
        cleanup();
        STATES.put(id, new Snapshot(id, status, Math.max(0, Math.min(100, progress)), message, "", Instant.now().toEpochMilli()));
    }

    public static void ready(String roomId, String imageUrl) {
        String id = normalize(roomId);
        if (id.isBlank()) return;
        cleanup();
        STATES.put(id, new Snapshot(id, "IMAGE_READY", 98, "挑战图已生成，正在加载画面", imageUrl == null ? "" : imageUrl, Instant.now().toEpochMilli()));
    }

    public static void failed(String roomId, String message) {
        String id = normalize(roomId);
        if (id.isBlank()) return;
        Snapshot previous = STATES.get(id);
        int progress = previous == null ? 8 : previous.progress();
        STATES.put(id, new Snapshot(id, "FAILED", progress, message, "", Instant.now().toEpochMilli()));
    }

    public static Snapshot snapshot(String roomId) {
        cleanup();
        Snapshot value = STATES.get(normalize(roomId));
        return value == null ? null : value;
    }

    public static void clear(String roomId) {
        STATES.remove(normalize(roomId));
    }

    private static String normalize(String roomId) {
        return roomId == null ? "" : roomId.trim();
    }

    private static void cleanup() {
        long cutoff = System.currentTimeMillis() - RETENTION_MILLIS;
        STATES.entrySet().removeIf(entry -> entry.getValue().updatedAt() < cutoff);
    }

    public record Snapshot(
            String roomId,
            String status,
            int progress,
            String message,
            String imageUrl,
            long updatedAt
    ) {
    }
}
