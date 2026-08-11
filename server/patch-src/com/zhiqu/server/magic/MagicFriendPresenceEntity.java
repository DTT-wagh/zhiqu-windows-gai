package com.zhiqu.server.magic;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "magic_friend_presence")
class MagicFriendPresenceEntity {
    @Id
    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    @Column(name = "active_room_id", length = 36)
    private String activeRoomId;

    protected MagicFriendPresenceEntity() {
    }

    MagicFriendPresenceEntity(String userId, Instant lastSeenAt, String activeRoomId) {
        this.userId = userId;
        this.lastSeenAt = lastSeenAt;
        this.activeRoomId = activeRoomId;
    }

    void refresh(Instant now, String roomId) {
        lastSeenAt = now;
        activeRoomId = roomId;
    }

    String getUserId() {
        return userId;
    }

    Instant getLastSeenAt() {
        return lastSeenAt;
    }

    String getActiveRoomId() {
        return activeRoomId;
    }
}
