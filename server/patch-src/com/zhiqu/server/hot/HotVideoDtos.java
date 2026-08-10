package com.zhiqu.server.hot;

import java.time.Instant;

public final class HotVideoDtos {
    private HotVideoDtos() {
    }

    public record HotVideoView(
            String id,
            String type,
            String title,
            String summary,
            String coverUrl,
            String categorySlug,
            String categoryName,
            String difficulty,
            int durationSeconds,
            int durationMinutes,
            String seriesId,
            String topicKey,
            String status,
            String reviewStatus,
            String safetyStatus,
            boolean childSafe,
            String qualityStatus,
            Instant publishedAt,
            long viewCount,
            long recentViews24h,
            long recentViews7d,
            long viewerCount,
            long completedViewerCount,
            long favoriteCount,
            long likeCount,
            long shareCount,
            long commentCount,
            long quizAttemptCount,
            long quizCorrectCount,
            int quizCount
    ) {
    }
}
