package com.zhiqu.server.magic;

import org.springframework.security.core.Authentication;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/magic-game-rooms")
public final class MagicImageProgressController {
    private final MagicGameService magicGames;
    private final MagicImageGenerationService generation;

    public MagicImageProgressController(MagicGameService magicGames, MagicImageGenerationService generation) {
        this.magicGames = magicGames;
        this.generation = generation;
    }

    @PostMapping("/{roomId}/mentor-cast-async")
    public ResponseEntity<MagicGameDtos.MagicGameSnapshot> castMentorAsync(
            @PathVariable("roomId") String roomId,
            @RequestBody MagicGameDtos.CastRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.accepted().body(generation.start(roomId, authentication.getName(), request));
    }

    @GetMapping("/{roomId}/image-progress")
    public MagicImageProgress.Snapshot progress(
            @PathVariable("roomId") String roomId,
            Authentication authentication
    ) {
        // The room service performs the same membership and expiry checks as the room snapshot endpoint.
        magicGames.get(authentication.getName(), roomId);
        MagicImageProgress.Snapshot snapshot = MagicImageProgress.snapshot(roomId);
        return snapshot == null
                ? new MagicImageProgress.Snapshot(roomId, "PREPARING", 8, "正在准备生成挑战图", "", System.currentTimeMillis())
                : snapshot;
    }
}
