package com.zhiqu.server.magic;

import com.zhiqu.server.common.ApiException;
import jakarta.annotation.PreDestroy;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public final class MagicImageGenerationService {
    private static final Logger LOGGER = LoggerFactory.getLogger(MagicImageGenerationService.class);

    private final MagicGameService magicGames;
    private final Map<String, Job> jobs = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newFixedThreadPool(2, new ImageThreadFactory());

    public MagicImageGenerationService(MagicGameService magicGames) {
        this.magicGames = magicGames;
    }

    public MagicGameDtos.MagicGameSnapshot start(
            String roomId,
            String username,
            MagicGameDtos.CastRequest request
    ) {
        MagicGameDtos.MagicGameSnapshot room = magicGames.get(username, roomId);
        if (room.currentUserRole() != MagicGameRole.MENTOR) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MAGIC_MENTOR_REQUIRED", "只有本局创作者可以生成挑战图");
        }
        if (room.status() != MagicGameStatus.ROUND_1) {
            throw new ApiException(HttpStatus.CONFLICT, "MAGIC_ROUND_CHANGED", "本局已经进入下一阶段，请刷新房间");
        }
        if (request == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "MAGIC_TERMS_REQUIRED", "请选择四个提示词后再生成图片");
        }
        MagicImageApi.validateTerms(request.terms());

        Job job = new Job(UUID.randomUUID().toString());
        Job running = jobs.putIfAbsent(roomId, job);
        if (running != null) return room;

        MagicImageProgress.update(roomId, "QUEUED", 12, "生成任务已提交，正在等待图片模型");
        try {
            executor.execute(() -> generate(job, roomId, username, request));
        } catch (RuntimeException exception) {
            jobs.remove(roomId, job);
            MagicImageProgress.failed(roomId, "图片生成任务启动失败，请重新尝试");
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MAGIC_IMAGE_START_FAILED", "图片生成任务启动失败，请重新尝试");
        }
        return room;
    }

    private void generate(
            Job job,
            String roomId,
            String username,
            MagicGameDtos.CastRequest request
    ) {
        try {
            magicGames.castMentor(username, roomId, request);
        } catch (RuntimeException exception) {
            MagicImageProgress.Snapshot progress = MagicImageProgress.snapshot(roomId);
            if (progress == null || !"FAILED".equals(progress.status())) {
                MagicImageProgress.failed(roomId, "图片生成失败，请重新尝试");
            }
            LOGGER.warn("Magic image generation failed for room {}: {}", roomId, exception.getMessage());
        } finally {
            jobs.remove(roomId, job);
        }
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    private record Job(String id) {
    }

    private static final class ImageThreadFactory implements ThreadFactory {
        private int sequence;

        @Override
        public synchronized Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "magic-image-generation-" + (++sequence));
            thread.setDaemon(true);
            return thread;
        }
    }
}
