package com.zhiqu.server.assistant;

import com.zhiqu.server.common.ApiException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
final class AiAssistantGenerationRegistry {
    private static final long CANCEL_TTL_MILLIS = Duration.ofMinutes(1).toMillis();

    private final Map<String, GenerationHandle> active = new ConcurrentHashMap<>();
    private final Map<String, Long> cancelled = new ConcurrentHashMap<>();

    GenerationHandle begin(String userId, String conversationId, String requestId) {
        cleanupCancelled();
        String key = key(userId, requestId);
        GenerationHandle handle = new GenerationHandle(key, conversationId, requestId);
        Long cancelledAt = cancelled.get(key);
        if (cancelledAt != null && System.currentTimeMillis() - cancelledAt <= CANCEL_TTL_MILLIS) {
            handle.cancel();
        }
        GenerationHandle existing = active.putIfAbsent(key, handle);
        if (existing != null) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "AI_GENERATION_IN_PROGRESS",
                    "该请求正在生成，请稍候"
            );
        }
        return handle;
    }

    void cancel(String userId, String requestId) {
        cleanupCancelled();
        String key = key(userId, requestId);
        cancelled.put(key, System.currentTimeMillis());
        GenerationHandle handle = active.get(key);
        if (handle != null) handle.cancel();
    }

    void finish(GenerationHandle handle) {
        if (handle == null) return;
        active.remove(handle.key(), handle);
        if (handle.cancelled()) cancelled.remove(handle.key());
    }

    private void cleanupCancelled() {
        long cutoff = System.currentTimeMillis() - CANCEL_TTL_MILLIS;
        cancelled.entrySet().removeIf(entry -> entry.getValue() < cutoff);
    }

    private String key(String userId, String requestId) {
        return userId + ':' + requestId;
    }

    static final class GenerationHandle {
        private final String key;
        private final String conversationId;
        private final String requestId;
        private final AtomicBoolean cancelled = new AtomicBoolean(false);
        private volatile CompletableFuture<?> providerRequest;

        private GenerationHandle(String key, String conversationId, String requestId) {
            this.key = key;
            this.conversationId = conversationId;
            this.requestId = requestId;
        }

        String key() {
            return key;
        }

        String conversationId() {
            return conversationId;
        }

        String requestId() {
            return requestId;
        }

        void attach(CompletableFuture<?> request) {
            providerRequest = request;
            if (cancelled.get()) request.cancel(true);
        }

        void cancel() {
            cancelled.set(true);
            CompletableFuture<?> request = providerRequest;
            if (request != null) request.cancel(true);
        }

        void throwIfCancelled() {
            if (!cancelled.get()) return;
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "AI_GENERATION_CANCELLED",
                    "AI 生成已停止"
            );
        }

        boolean cancelled() {
            return cancelled.get();
        }
    }
}
