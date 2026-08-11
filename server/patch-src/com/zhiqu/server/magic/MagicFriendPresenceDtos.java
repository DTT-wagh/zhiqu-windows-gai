package com.zhiqu.server.magic;

import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

final class MagicFriendPresenceDtos {
    private MagicFriendPresenceDtos() {
    }

    record PresenceHeartbeatRequest(@Size(max = 36) String activeRoomId) {
    }

    record FriendPresenceView(
            String friendshipId,
            String publicProfileId,
            String nickname,
            String avatarKey,
            String status,
            String activeRoomId,
            boolean pendingGameInvitation
    ) {
    }

    record FriendPresenceResponse(List<FriendPresenceView> items, Instant serverNow) {
    }
}
