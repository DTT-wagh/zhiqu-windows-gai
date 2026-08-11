package com.zhiqu.server.magic;

import com.zhiqu.server.magic.MagicFriendPresenceDtos.FriendPresenceResponse;
import com.zhiqu.server.magic.MagicFriendPresenceDtos.PresenceHeartbeatRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/magic/friends")
public class MagicFriendPresenceController {
    private final MagicFriendPresenceService service;

    public MagicFriendPresenceController(MagicFriendPresenceService service) {
        this.service = service;
    }

    @GetMapping
    FriendPresenceResponse friends(Authentication authentication) {
        return service.friends(authentication.getName());
    }

    @PostMapping("/presence")
    FriendPresenceResponse heartbeat(
            @Valid @RequestBody(required = false) PresenceHeartbeatRequest request,
            Authentication authentication
    ) {
        return service.heartbeat(authentication.getName(), request == null ? null : request.activeRoomId());
    }
}
