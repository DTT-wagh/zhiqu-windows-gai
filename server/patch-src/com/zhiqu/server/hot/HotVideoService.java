package com.zhiqu.server.hot;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.zhiqu.server.learning.LearningDtos;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public final class HotVideoService {
    private static final double NEUTRAL_RATE = 0.5;
    private static final double PRIOR_SAMPLE_SIZE = 20.0;
    private static final int MAX_EARLY_ITEMS_PER_GROUP = 2;
    private static final int LEARNING_FEATURED_LIMIT = 6;

    private static final String HOT_VIDEO_QUERY = """
            SELECT c.id, c.type, c.title, c.summary,
                   COALESCE(v.poster_url, c.cover_url) AS cover_url,
                   category.slug AS category_slug, category.name AS category_name,
                   c.difficulty, c.duration_seconds, c.duration_minutes,
                   c.status, c.review_status, c.published_at, c.view_count,
                   COALESCE(history.viewer_count, 0) AS viewer_count,
                   COALESCE(history.completed_viewer_count, 0) AS completed_viewer_count,
                   COALESCE(history.recent_views_24h, 0) AS recent_views_24h,
                   COALESCE(history.recent_views_7d, 0) AS recent_views_7d,
                   COALESCE(favorite.favorite_count, 0) AS favorite_count,
                   COALESCE(quiz.quiz_count, 0) AS quiz_count,
                   COALESCE(quiz.quiz_attempt_count, 0) AS quiz_attempt_count,
                   COALESCE(quiz.quiz_correct_count, 0) AS quiz_correct_count,
                   COALESCE(topic.topic_key, category.slug) AS topic_key
            FROM contents c
            JOIN categories category ON category.id = c.category_id AND category.active = TRUE
            JOIN video_assets v ON v.content_id = c.id
                               AND v.provider = 'TENCENT_VOD'
                               AND v.transcode_status = 'READY'
            LEFT JOIN (
                SELECT content_id,
                       COUNT(*) AS viewer_count,
                       SUM(CASE WHEN completed = TRUE THEN 1 ELSE 0 END) AS completed_viewer_count,
                       SUM(CASE WHEN last_viewed_at >= ? THEN 1 ELSE 0 END) AS recent_views_24h,
                       SUM(CASE WHEN last_viewed_at >= ? THEN 1 ELSE 0 END) AS recent_views_7d
                FROM viewing_history
                GROUP BY content_id
            ) history ON history.content_id = c.id
            LEFT JOIN (
                SELECT content_id, COUNT(*) AS favorite_count
                FROM favorites
                GROUP BY content_id
            ) favorite ON favorite.content_id = c.id
            LEFT JOIN (
                SELECT video_quiz.content_id,
                       COUNT(DISTINCT video_quiz.id) AS quiz_count,
                       COUNT(quiz_attempt.id) AS quiz_attempt_count,
                       SUM(CASE WHEN quiz_attempt.correct = TRUE THEN 1 ELSE 0 END) AS quiz_correct_count
                FROM video_quizzes video_quiz
                LEFT JOIN quiz_attempts quiz_attempt ON quiz_attempt.quiz_id = video_quiz.id
                WHERE video_quiz.review_status = 'APPROVED'
                GROUP BY video_quiz.content_id
            ) quiz ON quiz.content_id = c.id
            LEFT JOIN (
                SELECT content_tag.content_id, MIN(tag.slug) AS topic_key
                FROM content_tags content_tag
                JOIN tags tag ON tag.id = content_tag.tag_id AND tag.active = TRUE
                GROUP BY content_tag.content_id
            ) topic ON topic.content_id = c.id
            WHERE c.type = 'VIDEO'
              AND c.status = 'PUBLISHED'
              AND c.review_status = 'APPROVED'
              AND c.summary IS NOT NULL
              AND CHAR_LENGTH(TRIM(c.summary)) > 0
              AND c.duration_seconds > 0
            ORDER BY c.id
            """;

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public HotVideoService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public List<HotVideoDtos.HotVideoView> list() {
        Instant now = clock.instant();
        List<HotVideoDtos.HotVideoView> candidates = jdbc.query(
                HOT_VIDEO_QUERY,
                HotVideoService::video,
                Timestamp.from(now.minus(Duration.ofHours(24))),
                Timestamp.from(now.minus(Duration.ofDays(7)))
        );
        return rank(candidates, now);
    }

    private static List<HotVideoDtos.HotVideoView> rank(
            List<HotVideoDtos.HotVideoView> candidates,
            Instant now
    ) {
        if (candidates.isEmpty()) return List.of();

        double[] viewScores = logNormalize(candidates.stream().mapToDouble(HotVideoDtos.HotVideoView::viewCount).toArray());
        double[] growthScores = logNormalize(candidates.stream().mapToDouble(candidate ->
                0.6 * candidate.recentViews24h() + 0.4 * candidate.recentViews7d() / 7.0
        ).toArray());
        List<ScoredVideo> scored = new ArrayList<>(candidates.size());
        for (int index = 0; index < candidates.size(); index++) {
            HotVideoDtos.HotVideoView candidate = candidates.get(index);
            double completionRate = adjustedRate(candidate.completedViewerCount(), candidate.viewerCount());
            double favoriteRate = adjustedRate(candidate.favoriteCount(), candidate.viewerCount());
            double learningEffect = candidate.quizCount() > 0
                    ? adjustedRate(candidate.quizCorrectCount(), candidate.quizAttemptCount())
                    : NEUTRAL_RATE;
            double score = 100.0 * (
                    0.20 * viewScores[index]
                    + 0.20 * growthScores[index]
                    + 0.20 * completionRate
                    + 0.10 * favoriteRate
                    + 0.10 * NEUTRAL_RATE
                    + 0.05 * NEUTRAL_RATE
                    + 0.05 * NEUTRAL_RATE
                    + 0.05 * learningEffect
                    + 0.05 * freshness(candidate.publishedAt(), now)
            );
            scored.add(new ScoredVideo(candidate, clamp(score, 0.0, 100.0)));
        }
        scored.sort(Comparator.comparingDouble(ScoredVideo::score).reversed()
                .thenComparing(scoredVideo -> scoredVideo.video().id()));
        return diversify(scored);
    }

    private static List<HotVideoDtos.HotVideoView> diversify(List<ScoredVideo> scored) {
        List<HotVideoDtos.HotVideoView> early = new ArrayList<>(scored.size());
        List<HotVideoDtos.HotVideoView> deferred = new ArrayList<>();
        Map<String, Integer> seriesCounts = new HashMap<>();
        Map<String, Integer> topicCounts = new HashMap<>();
        for (ScoredVideo item : scored) {
            HotVideoDtos.HotVideoView video = item.video();
            int seriesCount = seriesCounts.getOrDefault(video.seriesId(), 0);
            int topicCount = topicCounts.getOrDefault(video.topicKey(), 0);
            if (seriesCount >= MAX_EARLY_ITEMS_PER_GROUP || topicCount >= MAX_EARLY_ITEMS_PER_GROUP) {
                deferred.add(video);
                continue;
            }
            early.add(video);
            seriesCounts.put(video.seriesId(), seriesCount + 1);
            topicCounts.put(video.topicKey(), topicCount + 1);
        }
        early.addAll(deferred);
        return List.copyOf(early);
    }

    private static double[] logNormalize(double[] values) {
        double[] transformed = new double[values.length];
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        for (int index = 0; index < values.length; index++) {
            transformed[index] = Math.log1p(Math.max(0.0, values[index]));
            min = Math.min(min, transformed[index]);
            max = Math.max(max, transformed[index]);
        }
        if (!Double.isFinite(min) || !Double.isFinite(max) || max - min < 1e-9) {
            java.util.Arrays.fill(transformed, NEUTRAL_RATE);
            return transformed;
        }
        for (int index = 0; index < transformed.length; index++) {
            transformed[index] = clamp((transformed[index] - min) / (max - min), 0.0, 1.0);
        }
        return transformed;
    }

    private static double adjustedRate(long successes, long sampleSize) {
        long boundedSuccesses = Math.max(0, successes);
        long boundedSampleSize = Math.max(boundedSuccesses, sampleSize);
        if (boundedSampleSize == 0) return NEUTRAL_RATE;
        double observed = clamp((double) boundedSuccesses / boundedSampleSize, 0.0, 1.0);
        return clamp(
                (observed * boundedSampleSize + NEUTRAL_RATE * PRIOR_SAMPLE_SIZE)
                        / (boundedSampleSize + PRIOR_SAMPLE_SIZE),
                0.0,
                1.0
        );
    }

    private static double freshness(Instant publishedAt, Instant now) {
        if (publishedAt == null) return NEUTRAL_RATE;
        double days = Math.max(0.0, ChronoUnit.SECONDS.between(publishedAt, now) / 86400.0);
        return clamp(Math.exp(-days / 30.0), 0.0, 1.0);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private record ScoredVideo(HotVideoDtos.HotVideoView video, double score) {
    }

    public List<LearningDtos.Course> learningCourses() {
        return list().stream().map(video -> new LearningDtos.Course(
                video.id(),
                video.type(),
                video.title(),
                video.summary(),
                video.coverUrl(),
                video.categorySlug(),
                video.categoryName(),
                video.difficulty(),
                video.durationSeconds(),
                video.durationMinutes(),
                List.of(),
                LearningDtos.LearningStatus.NOT_STARTED,
                0,
                false,
                List.of()
        )).limit(LEARNING_FEATURED_LIMIT).toList();
    }

    private static HotVideoDtos.HotVideoView video(ResultSet result, int rowNumber) throws SQLException {
        Timestamp publishedAt = result.getTimestamp("published_at");
        String id = result.getString("id");
        return new HotVideoDtos.HotVideoView(
                id,
                result.getString("type"),
                result.getString("title"),
                result.getString("summary"),
                result.getString("cover_url"),
                result.getString("category_slug"),
                result.getString("category_name"),
                result.getString("difficulty"),
                result.getInt("duration_seconds"),
                result.getInt("duration_minutes"),
                id,
                result.getString("topic_key"),
                result.getString("status"),
                result.getString("review_status"),
                "SAFE",
                true,
                "QUALIFIED",
                publishedAt == null ? null : publishedAt.toInstant(),
                result.getLong("view_count"),
                result.getLong("recent_views_24h"),
                result.getLong("recent_views_7d"),
                result.getLong("viewer_count"),
                result.getLong("completed_viewer_count"),
                result.getLong("favorite_count"),
                0,
                0,
                0,
                result.getLong("quiz_attempt_count"),
                result.getLong("quiz_correct_count"),
                result.getInt("quiz_count")
        );
    }
}
