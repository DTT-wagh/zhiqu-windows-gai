# 智趣项目 E-R 图

本图按项目最终数据库模型整理，覆盖基线迁移 V1-V37，以及当前补丁迁移/补丁脚本 V38-V43。实体属性只列出主键、外键和能够说明业务用途的字段；完整字段定义以 `server/zhiqu-server.jar` 内的 `db/migration` 和 `server/patch-src` 为准。

图中的关系线来自数据库外键。标记为“逻辑关联”的字段（例如多人游戏的 `room_id`、`next_room_id`，以及通用通知的 `reference_id`）由业务代码约定，但数据库没有声明 FK，因此不代表数据库级约束。

无损图片版：[erd.svg](./erd.svg)

中文阅读版：[erd-zh.md](./erd-zh.md) · [中文拆分版（6 张图）](./erd-zh-split.md) · [中文无损图片](./erd-zh.svg)

```mermaid
erDiagram
    users {
        string id PK
        string username UK
        string nickname
        string status
    }
    refresh_tokens {
        string id PK
        string user_id FK
        datetime expires_at
        datetime revoked_at
    }
    categories {
        string id PK
        string slug UK
        string name
        int sort_order
    }
    contents {
        string id PK
        string category_id FK
        string type
        string title
        string status
    }
    favorites {
        string id PK
        string user_id FK
        string content_id FK
        datetime created_at
    }
    viewing_history {
        string id PK
        string user_id FK
        string content_id FK
        int progress_seconds
        boolean completed
    }
    learning_tasks {
        string id PK
        string slug UK
        string title
        boolean active
    }
    task_items {
        string id PK
        string task_id FK
        string item_type
        string item_value
    }
    mentor_rooms {
        string id PK
        string task_id FK
        string mentor_user_id FK
        string novice_user_id FK
        string status
    }
    task_submissions {
        string id PK
        string room_id FK
        string novice_user_id FK
        string request_id UK
    }
    mentor_reviews {
        string id PK
        string room_id FK
        string mentor_user_id FK
        string request_id UK
    }
    learning_results {
        string id PK
        string room_id FK
        string badge_code
    }
    user_preferences {
        string user_id PK, FK
        string student_stage
        boolean comfortable_display
        string subtitle_size
    }
    content_stages {
        string content_id PK, FK
        string student_stage PK
    }
    tags {
        string id PK
        string slug UK
        string name
    }
    content_tags {
        string content_id PK, FK
        string tag_id PK, FK
        int sort_order
    }
    video_assets {
        string id PK
        string content_id FK, UK
        string provider
        int duration_seconds
    }
    subtitle_tracks {
        string id PK
        string content_id FK
        string language
        string review_status
    }
    video_chapters {
        string id PK
        string content_id FK
        int start_seconds
        string title
    }
    ai_transparency_cards {
        string id PK
        string content_id FK, UK
        string review_status
    }
    video_quizzes {
        string id PK
        string content_id FK
        string knowledge_tag_id FK
        int trigger_seconds
    }
    video_quiz_options {
        string id PK
        string quiz_id FK
        string option_key
        boolean correct
    }
    content_import_batches {
        string id PK
        string request_id UK
        string content_id FK
        string status
    }
    daily_facts {
        string id PK
        string review_status
        date active_from
        boolean active
    }
    quiz_attempts {
        string id PK
        string user_id FK
        string quiz_id FK
        string option_id FK
        boolean correct
    }
    wrong_answers {
        string id PK
        string user_id FK
        string quiz_id FK
        datetime mastered_at
    }
    progress_update_requests {
        string request_id PK
        string user_id FK
        string content_id FK
        int resulting_progress_seconds
        boolean resulting_completed
    }
    xp_ledger {
        string id PK
        string user_id FK
        string event_type
        int awarded_amount
    }
    achievements {
        string id PK
        string code UK
        string name
        boolean active
    }
    user_achievements {
        string id PK
        string user_id FK
        string achievement_id FK
        string source_event_id FK
    }
    game_content_links {
        string id PK
        string game_code
        string content_id FK
        int sort_order
    }
    magic_game_rooms {
        string id PK
        string mentor_user_id FK
        string novice_user_id FK
        string next_room_id
        string status
    }
    blind_box_tasks {
        string id PK
        string source
        string sketch_url
    }
    blind_box_rooms {
        string id PK
        string boss_user_id FK
        string designer_user_id FK
        string task_id FK
        string next_room_id
        string status
    }
    truth_game_rooms {
        string id PK
        string undercover_user_id FK
        string detective_user_id FK
        string evidence_message_id
        string next_room_id
        string status
    }
    truth_game_messages {
        string id PK
        string room_id FK
        int round_number
        string speaker
    }
    jailbreak_game_rooms {
        string id PK
        string host_user_id FK
        string resolving_attempt_id
        string status
    }
    jailbreak_game_members {
        string id PK
        string room_id FK
        string user_id FK
        string role
    }
    jailbreak_game_audio {
        string id PK
        string room_id FK
        string sender_user_id
        int round_number
    }
    jailbreak_game_attempts {
        string id PK
        string room_id FK
        string operator_user_id
        int round_number
    }
    jailbreak_game_actions {
        string request_id PK
        string room_id FK
        string user_id FK
        string action_type
    }
    account_deletion_audits {
        string request_id PK
        string subject_hash UK
        string status
    }
    social_profiles {
        string user_id PK, FK
        string public_profile_id UK
        string friend_code UK
    }
    friend_requests {
        string id PK
        string requester_id FK
        string recipient_id FK
        string status
        string request_id UK
    }
    friendships {
        string id PK
        string user_low_id FK
        string user_high_id FK
        string latest_request_id FK
        string removed_by_user_id FK
        string status
    }
    user_blocks {
        string id PK
        string blocker_id FK
        string blocked_id FK
        string request_id UK
    }
    game_invitations {
        string id PK
        string inviter_id FK
        string invitee_id FK
        string friendship_id FK
        string game_code
        string room_id
        string status
    }
    community_game_listings {
        string id PK
        string host_user_id FK
        string joined_user_id FK
        string game_code
        string room_id
        string status
    }
    notifications {
        string id PK
        string recipient_id FK
        string actor_id FK
        string reference_type
        string reference_id
    }
    notification_outbox {
        string id PK
        string recipient_id FK
        string aggregate_type
        string aggregate_id
        string status
    }
    community_questions {
        string id PK
        string author_id FK
        string published_revision_id FK
        string checking_revision_id FK
        string accepted_answer_id FK
        string question_status
    }
    community_question_revisions {
        string id PK
        string question_id FK
        string category_id FK
        string linked_content_id FK
        int revision_number
        string safety_status
    }
    community_question_revision_tags {
        string revision_id PK, FK
        string tag_id PK, FK
        int sort_order
    }
    community_answers {
        string id PK
        string question_id FK
        string author_id FK
        string published_revision_id FK
        string checking_revision_id FK
        string lifecycle_status
    }
    community_answer_revisions {
        string id PK
        string answer_id FK
        string linked_content_id FK
        int revision_number
        string safety_status
    }
    community_bookmarks {
        string id PK
        string user_id FK
        string question_id FK
    }
    community_hidden_contents {
        string id PK
        string user_id FK
        string target_type
        string target_id
    }
    content_safety_checks {
        string id PK
        string target_type
        string target_id
        string decision
    }
    community_action_requests {
        string request_id PK
        string user_id FK
        string action_type
        string target_id
    }
    game_interaction_safety_checks {
        string id PK
        string game_code
        string room_id
        string sender_user_id FK
        string status
    }
    social_block_requests {
        string request_id PK
        string blocker_id FK
        string blocked_id FK
        string block_id FK
    }
    social_block_request_locks {
        string request_id PK
        datetime created_at
    }
    chat_conversations {
        string id PK
        string user_low_id FK
        string user_high_id FK
    }
    chat_messages {
        string id PK
        string conversation_id FK
        string sender_id FK
        string request_id UK
        string status
    }
    chat_stickers {
        string id PK
        string owner_id FK
        string storage_key
    }
    assistant_conversations {
        string id PK
        string user_id FK
        string title
        boolean memory_enabled
    }
    assistant_messages {
        string id PK
        string conversation_id FK
        string author_user_id FK
        string reply_to_message_id FK
        string role
        string safety_status
    }
    assistant_memory {
        string id PK
        string user_id FK
        string memory_key
        boolean enabled
    }
    assistant_recommendation_events {
        string id PK
        string user_id FK
        string conversation_id FK
        string message_id FK
        string content_id FK
        string event_type
    }
    single_player_game_instances {
        string id PK
        string user_id FK
        string game_code
        int level_no
        string status
    }
    single_player_game_submissions {
        string id PK
        string instance_id FK
        string round_id
        string request_id UK
    }
    single_player_game_progress {
        string user_id PK, FK
        string game_code PK
        int level_no PK
        boolean completed
    }

    users ||--o{ refresh_tokens : owns
    users ||--o| user_preferences : configures
    users ||--o{ favorites : saves
    contents ||--o{ favorites : is_saved_as
    users ||--o{ viewing_history : watches
    contents ||--o{ viewing_history : tracks
    categories ||--o{ contents : classifies
    learning_tasks ||--o{ task_items : contains
    learning_tasks ||--o{ mentor_rooms : powers
    users ||--o{ mentor_rooms : mentors
    users ||--o{ mentor_rooms : joins
    mentor_rooms ||--o| task_submissions : receives
    users ||--o{ task_submissions : submits
    mentor_rooms ||--o| mentor_reviews : reviewed_by
    users ||--o{ mentor_reviews : reviews
    mentor_rooms ||--o| learning_results : produces
    contents ||--o{ content_stages : targets
    tags ||--o{ content_tags : labels
    contents ||--o{ content_tags : tagged
    contents ||--o| video_assets : has_asset
    contents ||--o{ subtitle_tracks : has_subtitles
    contents ||--o{ video_chapters : has_chapters
    contents ||--o| ai_transparency_cards : explains
    contents ||--o{ video_quizzes : tests
    tags ||--o{ video_quizzes : knowledge_tag
    video_quizzes ||--o{ video_quiz_options : offers
    contents ||--o{ content_import_batches : imported_by
    users ||--o{ quiz_attempts : attempts
    video_quizzes ||--o{ quiz_attempts : answered
    video_quiz_options ||--o{ quiz_attempts : selected
    users ||--o{ wrong_answers : has
    video_quizzes ||--o{ wrong_answers : records
    users ||--o{ progress_update_requests : updates
    contents ||--o{ progress_update_requests : progresses
    users ||--o{ xp_ledger : earns
    users ||--o{ user_achievements : earns_badges
    achievements ||--o{ user_achievements : defines
    xp_ledger ||--o{ user_achievements : sources
    contents ||--o{ game_content_links : links
    users ||--o{ magic_game_rooms : magic_roles
    users ||--o{ blind_box_rooms : blind_box_roles
    blind_box_tasks ||--o{ blind_box_rooms : uses
    users ||--o{ truth_game_rooms : truth_roles
    truth_game_rooms ||--o{ truth_game_messages : contains
    users ||--o{ jailbreak_game_rooms : hosts
    jailbreak_game_rooms ||--o{ jailbreak_game_members : has_members
    users ||--o{ jailbreak_game_members : participates
    jailbreak_game_rooms ||--o{ jailbreak_game_audio : contains
    jailbreak_game_rooms ||--o{ jailbreak_game_attempts : contains
    jailbreak_game_rooms ||--o{ jailbreak_game_actions : records
    users ||--o{ jailbreak_game_actions : performs
    users ||--o| social_profiles : exposes
    users ||--o{ friend_requests : requests_friendship
    users ||--o{ friend_requests : receives_friend_request
    users ||--o{ friendships : lower_side
    users ||--o{ friendships : higher_side
    friend_requests ||--o{ friendships : latest_request
    users ||--o{ friendships : removes
    users ||--o{ user_blocks : blocks
    users ||--o{ user_blocks : is_blocked
    users ||--o{ game_invitations : invites
    users ||--o{ game_invitations : is_invited
    friendships ||--o{ game_invitations : permits
    users ||--o{ community_game_listings : hosts
    users ||--o{ community_game_listings : joins
    users ||--o{ notifications : receives
    users ||--o{ notifications : acts
    users ||--o{ notification_outbox : queued_for
    users ||--o{ community_questions : asks
    community_questions ||--o{ community_question_revisions : revisions
    categories ||--o{ community_question_revisions : categorizes
    contents ||--o{ community_question_revisions : references
    community_question_revisions ||--o{ community_question_revision_tags : tagged
    tags ||--o{ community_question_revision_tags : labels
    community_questions ||--o{ community_answers : receives
    users ||--o{ community_answers : answers
    community_answers ||--o{ community_answer_revisions : revisions
    contents ||--o{ community_answer_revisions : references
    users ||--o{ community_bookmarks : bookmarks
    community_questions ||--o{ community_bookmarks : bookmarked
    users ||--o{ community_hidden_contents : hides
    users ||--o{ community_action_requests : submits
    users ||--o{ game_interaction_safety_checks : sends
    users ||--o{ social_block_requests : blocks
    user_blocks ||--o{ social_block_requests : requested_by
    users ||--o{ chat_conversations : low_party
    users ||--o{ chat_conversations : high_party
    chat_conversations ||--o{ chat_messages : contains
    users ||--o{ chat_messages : sends
    users ||--o{ chat_stickers : owns
    users ||--o{ assistant_conversations : owns
    assistant_conversations ||--o{ assistant_messages : contains
    users ||--o{ assistant_messages : authors
    assistant_messages ||--o| assistant_messages : replies_to
    users ||--o{ assistant_memory : stores
    users ||--o{ assistant_recommendation_events : generates
    assistant_conversations ||--o{ assistant_recommendation_events : contextualizes
    assistant_messages ||--o{ assistant_recommendation_events : triggers
    contents ||--o{ assistant_recommendation_events : recommends
    users ||--o{ single_player_game_instances : starts
    single_player_game_instances ||--o{ single_player_game_submissions : receives
    users ||--o{ single_player_game_progress : tracks

    %% 逻辑关联：字段存在但数据库未声明 FK
    magic_game_rooms ||--o{ magic_game_rooms : next_room_id
    blind_box_rooms ||--o{ blind_box_rooms : next_room_id
    truth_game_rooms ||--o{ truth_game_rooms : next_room_id
    truth_game_rooms ||--o{ truth_game_messages : evidence_message_id
    jailbreak_game_rooms ||--o{ jailbreak_game_attempts : resolving_attempt_id
    game_invitations ||--o{ magic_game_rooms : room_id_game_code
    game_invitations ||--o{ blind_box_rooms : room_id_game_code
    game_invitations ||--o{ truth_game_rooms : room_id_game_code
    game_invitations ||--o{ jailbreak_game_rooms : room_id_game_code
    community_game_listings ||--o{ magic_game_rooms : room_id_game_code
    community_game_listings ||--o{ blind_box_rooms : room_id_game_code
    community_game_listings ||--o{ truth_game_rooms : room_id_game_code
    community_game_listings ||--o{ jailbreak_game_rooms : room_id_game_code
    notifications ||--o{ community_questions : reference_id
    notifications ||--o{ community_answers : reference_id
    notification_outbox ||--o{ community_questions : aggregate_id
    content_safety_checks ||--o{ community_questions : target_id
    content_safety_checks ||--o{ community_answers : target_id
    game_interaction_safety_checks ||--o{ magic_game_rooms : room_id
    game_interaction_safety_checks ||--o{ blind_box_rooms : room_id
    game_interaction_safety_checks ||--o{ truth_game_rooms : room_id
    game_interaction_safety_checks ||--o{ jailbreak_game_rooms : room_id
```

## 阅读要点

- `users` 是账号、学习记录、社交、游戏和 AI 助手数据的中心实体。
- `categories`、`contents`、`tags` 组成课程目录；`video_*`、测验和进度表扩展内容学习闭环。
- 社区采用“问题/答案主表 + revision 修订表”，发布中的修订通过 `published_revision_id` 等字段回指主表。
- 四类多人游戏的房间表分别保存游戏状态；社交大厅的 `game_code + room_id` 与具体房间之间是逻辑关联。
- `assistant_*` 和 `single_player_game_*` 来自 V42、V43；私聊 `chat_*` 来自 V38-V41 补丁。
