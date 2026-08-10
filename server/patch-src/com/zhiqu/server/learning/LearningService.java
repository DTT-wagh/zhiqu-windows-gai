package com.zhiqu.server.learning;

import com.zhiqu.server.common.ApiException;
import com.zhiqu.server.hot.HotVideoService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class LearningService {
    private static final int FEATURED_LIMIT = 6;
    private static final int NEWEST_LIMIT = 6;

    private final LearningQueryRepository queries;
    private final Clock clock;
    private final HotVideoService hotVideos;

    public LearningService(LearningQueryRepository queries, Clock clock, HotVideoService hotVideos) {
        this.queries = queries;
        this.clock = clock;
        this.hotVideos = hotVideos;
    }

    public LearningDtos.LearningResponse get(String userId, String category) {
        String normalizedCategory = normalizeCategory(category);
        validateCategory(normalizedCategory);
        List<LearningDtos.Category> categories = queries.categories().stream()
                .map(row -> new LearningDtos.Category(row.id(), row.slug(), row.name(), row.shortName(), row.iconName()))
                .toList();
        List<LearningQueryRepository.CourseRow> visibleRows = queries.visibleCourses(userId, normalizedCategory);
        Map<String, List<LearningDtos.KnowledgeTag>> tags = queries.tagsByContentId(
                visibleRows.stream().map(LearningQueryRepository.CourseRow::id).toList()
        );
        List<LearningDtos.Course> courses = visibleRows.stream().map(row -> course(row, tags)).toList();
        List<LearningDtos.Course> featured = hotVideos.learningCourses();
        if (featured.isEmpty()) {
            featured = queries.visibleCoursesFeatured(userId, normalizedCategory).stream()
                    .map(row -> course(row, tags)).limit(FEATURED_LIMIT).toList();
        }
        List<LearningDtos.Course> newest = queries.visibleCoursesNewest(userId, normalizedCategory).stream()
                .map(row -> course(row, tags)).limit(NEWEST_LIMIT).toList();
        LearningDtos.DailyFact dailyFact = queries.dailyFact(LocalDate.now(clock))
                .map(row -> new LearningDtos.DailyFact(row.id(), row.text(), row.sourceName(), row.sourceReference()))
                .orElse(null);
        LearningDtos.CategoryProgress progress = normalizedCategory == null ? null : queries.categoryProgress(userId, normalizedCategory)
                .map(row -> new LearningDtos.CategoryProgress(
                        row.categorySlug(), row.completedLessons(), row.totalLessons(), percent(row.completedLessons(), row.totalLessons())
                )).orElse(null);
        return new LearningDtos.LearningResponse(normalizedCategory, categories, dailyFact, featured, newest, progress, courses);
    }

    LearningDtos.Course course(LearningQueryRepository.CourseRow row, Map<String, List<LearningDtos.KnowledgeTag>> tags) {
        return course(row, tags, List.of());
    }

    LearningDtos.Course course(
            LearningQueryRepository.CourseRow row,
            Map<String, List<LearningDtos.KnowledgeTag>> tags,
            List<String> matchReasons
    ) {
        int progressSeconds = Math.min(Math.max(row.progressSeconds(), 0), Math.max(row.durationSeconds(), 0));
        return new LearningDtos.Course(
                row.id(), "VIDEO", row.title(), row.summary(), row.coverUrl(), row.categorySlug(), row.categoryName(),
                row.difficulty(), row.durationSeconds(), row.durationMinutes(), tags.getOrDefault(row.id(), List.of()),
                status(row.completed(), progressSeconds), progressSeconds, row.favorite(), matchReasons
        );
    }

    private LearningDtos.LearningStatus status(boolean completed, int progressSeconds) {
        if (completed) return LearningDtos.LearningStatus.COMPLETED;
        return progressSeconds > 0 ? LearningDtos.LearningStatus.IN_PROGRESS : LearningDtos.LearningStatus.NOT_STARTED;
    }

    private static int percent(int completed, int total) {
        if (total <= 0) return 0;
        return Math.min(100, Math.max(0, (int) Math.round(completed * 100.0 / total)));
    }

    private String normalizeCategory(String category) {
        return category == null || category.isBlank() ? null : category.trim();
    }

    private void validateCategory(String category) {
        if (category != null && queries.categories().stream().noneMatch(row -> category.equals(row.slug()))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CATEGORY", "请选择有效的学习分类");
        }
    }
}
