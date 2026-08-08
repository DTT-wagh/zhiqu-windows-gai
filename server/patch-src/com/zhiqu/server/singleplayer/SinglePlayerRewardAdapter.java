package com.zhiqu.server.singleplayer;

import com.zhiqu.server.reward.RewardAwarder;
import com.zhiqu.server.reward.RewardEventType;
import com.zhiqu.server.reward.RewardService.AwardResult;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.RewardView;
import java.time.Instant;
import org.springframework.stereotype.Component;

@Component
final class SinglePlayerRewardAdapter {
    private final RewardAwarder rewards;

    SinglePlayerRewardAdapter(RewardAwarder rewards) {
        this.rewards = rewards;
    }

    RewardView award(String userId, String gameCode, int levelNo, Instant completedAt) {
        String sourceId = "SP:" + gameCode + ":L" + levelNo;
        AwardResult result = rewards.award(
                userId,
                RewardEventType.GAME_REVIEW_COMPLETED,
                sourceId,
                completedAt
        );
        return new RewardView(
                result.id(), result.nominalAmount(), result.awardedAmount(), result.capped(), result.duplicate());
    }
}
