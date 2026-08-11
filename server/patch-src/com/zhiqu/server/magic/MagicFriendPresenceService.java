package com.zhiqu.server.magic;

import com.zhiqu.server.magic.MagicFriendPresenceDtos.FriendPresenceResponse;
import com.zhiqu.server.magic.MagicFriendPresenceDtos.FriendPresenceView;
import com.zhiqu.server.social.SocialDtos.FriendView;
import com.zhiqu.server.social.SocialService;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MagicFriendPresenceService {
    static final Duration ONLINE_WINDOW = Duration.ofSeconds(90);

    private final MagicFriendPresenceRepository presence;
    private final MagicGameRoomRepository rooms;
    private final SocialService social;

    public MagicFriendPresenceService(
            MagicFriendPresenceRepository presence,
            MagicGameRoomRepository rooms,
            SocialService social
    ) {
        this.presence = presence;
        this.rooms = rooms;
        this.social = social;
    }

    @Transactional(readOnly = true)
    public FriendPresenceResponse friends(String userId) {
        Instant now = Instant.now();
        List<FriendPresenceView> items = social.friends(userId).stream()
                .map(friend -> view(friend, now))
                .sorted(Comparator
                        .comparingInt((FriendPresenceView view) -> statusOrder(view.status()))
                        .thenComparing(FriendPresenceView::nickname, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return new FriendPresenceResponse(items, now);
    }

    @Transactional
    public FriendPresenceResponse heartbeat(String userId, String activeRoomId) {
        Instant now = Instant.now();
        String verifiedRoomId = verifiedRoomId(userId, activeRoomId);
        MagicFriendPresenceEntity current = presence.findById(userId).orElse(null);
        if (current == null) {
            presence.save(new MagicFriendPresenceEntity(userId, now, verifiedRoomId));
        } else {
            current.refresh(now, verifiedRoomId);
        }
        return friends(userId);
    }

    private FriendPresenceView view(FriendView friend, Instant now) {
        String friendUserId = social.userIdForPublicProfile(friend.student().publicProfileId());
        MagicFriendPresenceEntity current = presence.findById(friendUserId).orElse(null);
        boolean online = current != null
                && current.getLastSeenAt() != null
                && current.getLastSeenAt().plus(ONLINE_WINDOW).isAfter(now);
        String roomId = online ? verifiedRoomId(friendUserId, current.getActiveRoomId()) : null;
        String status = !online ? "OFFLINE" : roomId == null ? "ONLINE" : "IN_GAME";
        return new FriendPresenceView(
                friend.friendshipId(),
                friend.student().publicProfileId(),
                friend.student().nickname(),
                friend.student().avatarKey(),
                status,
                roomId,
                friend.pendingGameInvitation()
        );
    }

    private String verifiedRoomId(String userId, String candidateRoomId) {
        if (candidateRoomId == null || candidateRoomId.isBlank()) {
            return null;
        }
        return rooms.findById(candidateRoomId.trim())
                .filter(room -> room.getStatus().isActive())
                .filter(room -> userId.equals(room.getMentorUserId()) || userId.equals(room.getNoviceUserId()))
                .map(MagicGameRoomEntity::getId)
                .orElse(null);
    }

    private static int statusOrder(String status) {
        return switch (status) {
            case "ONLINE" -> 0;
            case "IN_GAME" -> 1;
            default -> 2;
        };
    }
}
