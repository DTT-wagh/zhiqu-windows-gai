package com.zhiqu.server.content;

import com.zhiqu.server.content.ContentDtos.CategoryResponse;
import com.zhiqu.server.content.ContentDtos.ContentDetail;
import com.zhiqu.server.content.ContentDtos.ContentSummary;
import com.zhiqu.server.content.ContentDtos.HistoryItem;
import com.zhiqu.server.content.ContentDtos.HistoryUpdateRequest;
import com.zhiqu.server.content.ContentDtos.PlaybackResponse;
import com.zhiqu.server.content.ContentDtos.ProgressUpdateResponse;
import com.zhiqu.server.content.ContentDtos.QuizAttemptRequest;
import com.zhiqu.server.content.ContentDtos.QuizAttemptResponse;
import com.zhiqu.server.content.ContentDtos.WrongAnswerItem;
import com.zhiqu.server.reward.LearningRewardCoordinator;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Content endpoints. Playback is public for published videos; account-bound
 * progress and learning actions continue to require an authenticated user.
 */
@RestController
public class ContentController {
    private final ContentService contentService;
    private final ContentPlaybackService playbackService;
    private final VideoCompanionService companionService;
    private final LearningRewardCoordinator rewardCoordinator;

    public ContentController(
            ContentService contentService,
            ContentPlaybackService playbackService,
            VideoCompanionService companionService,
            LearningRewardCoordinator rewardCoordinator
    ) {
        this.contentService = contentService;
        this.playbackService = playbackService;
        this.companionService = companionService;
        this.rewardCoordinator = rewardCoordinator;
    }

    @GetMapping("/api/categories")
    List<CategoryResponse> categories() {
        return contentService.listCategories();
    }

    @GetMapping("/api/contents")
    List<ContentSummary> contents(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "recommended") String sort,
            Authentication authentication
    ) {
        return contentService.list(type, category, sort, userId(authentication));
    }

    @GetMapping("/api/contents/{contentId}")
    ContentDetail content(@PathVariable String contentId, Authentication authentication) {
        return contentService.get(contentId, userId(authentication));
    }

    @GetMapping("/api/contents/{contentId}/playback")
    PlaybackResponse playback(@PathVariable String contentId, Authentication authentication) {
        return playbackService.get(contentId, userId(authentication));
    }

    @PostMapping("/api/quizzes/{quizId}/attempts")
    QuizAttemptResponse submitQuizAttempt(
            @PathVariable String quizId,
            @Valid @RequestBody QuizAttemptRequest request,
            Authentication authentication
    ) {
        return rewardCoordinator.submitAttempt(authentication.getName(), quizId, request);
    }

    @GetMapping("/api/wrong-answers")
    List<WrongAnswerItem> wrongAnswers(
            @RequestParam(defaultValue = "ALL") String status,
            Authentication authentication
    ) {
        return companionService.listWrongAnswers(authentication.getName(), status);
    }

    @GetMapping("/api/favorites")
    List<ContentSummary> favorites(Authentication authentication) {
        return contentService.listFavorites(authentication.getName());
    }

    @PutMapping("/api/favorites/{contentId}")
    ResponseEntity<Void> addFavorite(@PathVariable String contentId, Authentication authentication) {
        contentService.addFavorite(authentication.getName(), contentId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/api/favorites/{contentId}")
    ResponseEntity<Void> removeFavorite(@PathVariable String contentId, Authentication authentication) {
        contentService.removeFavorite(authentication.getName(), contentId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/history")
    List<HistoryItem> history(Authentication authentication) {
        return contentService.listHistory(authentication.getName());
    }

    @PutMapping("/api/history/{contentId}")
    ProgressUpdateResponse updateHistory(
            @PathVariable String contentId,
            @Valid @RequestBody HistoryUpdateRequest request,
            Authentication authentication
    ) {
        return rewardCoordinator.updateHistory(
                authentication.getName(),
                contentId,
                request.requestId(),
                request.progressSeconds()
        );
    }

    private String userId(Authentication authentication) {
        return authentication == null ? null : authentication.getName();
    }
}
