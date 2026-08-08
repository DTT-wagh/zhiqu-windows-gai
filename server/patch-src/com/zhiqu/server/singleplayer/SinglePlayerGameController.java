package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.CreateInstanceRequest;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.EvaluationView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.FinishRequest;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.FinishView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.GameSummary;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.InstanceView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.MutationRequest;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.ProgressView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.SubmitRoundRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/single-player-games")
public class SinglePlayerGameController {
    private final SinglePlayerGameService service;
    private final SinglePlayerMediaStore mediaStore;

    public SinglePlayerGameController(SinglePlayerGameService service, SinglePlayerMediaStore mediaStore) {
        this.service = service;
        this.mediaStore = mediaStore;
    }

    @GetMapping
    List<GameSummary> games() {
        return service.games();
    }

    @GetMapping("/progress")
    List<ProgressView> progress(Authentication authentication) {
        return service.progress(authentication.getName());
    }

    @PostMapping("/{gameCode}/instances")
    ResponseEntity<InstanceView> create(
            @PathVariable String gameCode,
            @Valid @RequestBody CreateInstanceRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.create(authentication.getName(), gameCode, request));
    }

    @GetMapping("/instances/{instanceId}")
    InstanceView instance(@PathVariable String instanceId, Authentication authentication) {
        return service.instance(authentication.getName(), instanceId);
    }

    @PostMapping("/instances/{instanceId}/rounds/{roundId}/submit")
    EvaluationView submit(
            @PathVariable String instanceId,
            @PathVariable String roundId,
            @Valid @RequestBody SubmitRoundRequest request,
            Authentication authentication
    ) {
        return service.submit(authentication.getName(), instanceId, roundId, request);
    }

    @PostMapping("/instances/{instanceId}/retry-generation")
    ResponseEntity<InstanceView> retryGeneration(
            @PathVariable String instanceId,
            @Valid @RequestBody MutationRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(service.retryGeneration(authentication.getName(), instanceId, request, false));
    }

    @PostMapping("/instances/{instanceId}/regenerate")
    ResponseEntity<InstanceView> regenerate(
            @PathVariable String instanceId,
            @Valid @RequestBody MutationRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(service.retryGeneration(authentication.getName(), instanceId, request, true));
    }

    @PostMapping("/instances/{instanceId}/finish")
    FinishView finish(
            @PathVariable String instanceId,
            @Valid @RequestBody FinishRequest request,
            Authentication authentication
    ) {
        return service.finish(authentication.getName(), instanceId, request);
    }

    @GetMapping("/media/{instanceId}/{key}")
    ResponseEntity<byte[]> media(@PathVariable String instanceId, @PathVariable String key) {
        SinglePlayerMediaStore.StoredMedia media = mediaStore.read(instanceId, key);
        if (media == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(media.contentType()))
                .cacheControl(CacheControl.noCache())
                .header("X-Content-Type-Options", "nosniff")
                .body(media.bytes());
    }
}
