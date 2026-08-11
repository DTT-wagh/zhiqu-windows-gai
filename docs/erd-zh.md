# 智趣项目 E-R 图（中文阅读版）

这张图用于业务阅读。每个表标题显示为“中文名称 + 真实表名”，字段列保留数据库真实字段名，并在最右侧附中文含义；PK 表示主键，FK 表示外键，UK 表示唯一键。

数据库结构来源于基线迁移 V1-V37，以及 V38-V43 私聊、AI 助手和单机游戏补丁。逻辑关联仍保留“（逻辑）”标记，表示代码使用了该字段但数据库没有声明 FK。

无损图片版：[erd-zh.svg](./erd-zh.svg)

推荐阅读：[核心表与重要表（4 张精简图）](./erd-core.md)

完整拆分版：[按业务模块拆分的 6 张图](./erd-zh-split.md)

```mermaid
erDiagram
    "用户 users" {
        string id PK "编号"
        string username UK "用户名"
        string nickname "昵称"
        string status "状态"
    }
    "刷新令牌 refresh_tokens" {
        string id PK "编号"
        string user_id FK "用户编号"
        datetime expires_at "过期时间"
        datetime revoked_at "撤销时间"
    }
    "课程分类 categories" {
        string id PK "编号"
        string slug UK "唯一标识"
        string name "名称"
        int sort_order "排序"
    }
    "学习内容 contents" {
        string id PK "编号"
        string category_id FK "分类编号"
        string type "内容类型"
        string title "标题"
        string status "状态"
    }
    "收藏记录 favorites" {
        string id PK "编号"
        string user_id FK "用户编号"
        string content_id FK "内容编号"
        datetime created_at "创建时间"
    }
    "观看记录 viewing_history" {
        string id PK "编号"
        string user_id FK "用户编号"
        string content_id FK "内容编号"
        int progress_seconds "字段：progress_seconds"
        boolean completed "是否完成"
    }
    "学习任务 learning_tasks" {
        string id PK "编号"
        string slug UK "唯一标识"
        string title "标题"
        boolean active "字段：active"
    }
    "任务选项 task_items" {
        string id PK "编号"
        string task_id FK "任务编号"
        string item_type "选项类型"
        string item_value "选项内容"
    }
    "导师房间 mentor_rooms" {
        string id PK "编号"
        string task_id FK "任务编号"
        string mentor_user_id FK "导师用户编号"
        string novice_user_id FK "新手用户编号"
        string status "状态"
    }
    "任务提交 task_submissions" {
        string id PK "编号"
        string room_id FK "房间编号"
        string novice_user_id FK "新手用户编号"
        string request_id UK "请求编号"
    }
    "导师评价 mentor_reviews" {
        string id PK "编号"
        string room_id FK "房间编号"
        string mentor_user_id FK "导师用户编号"
        string request_id UK "请求编号"
    }
    "学习结果 learning_results" {
        string id PK "编号"
        string room_id FK "房间编号"
        string badge_code "徽章代码"
    }
    "用户偏好 user_preferences" {
        string user_id PK, FK "用户编号"
        string student_stage "学生阶段"
        boolean comfortable_display "舒适显示"
        string subtitle_size "字幕字号"
    }
    "内容适用阶段 content_stages" {
        string content_id PK, FK "内容编号"
        string student_stage PK "学生阶段"
    }
    "标签 tags" {
        string id PK "编号"
        string slug UK "唯一标识"
        string name "名称"
    }
    "内容标签关联 content_tags" {
        string content_id PK, FK "内容编号"
        string tag_id PK, FK "字段：tag_id"
        int sort_order "排序"
    }
    "视频资源 video_assets" {
        string id PK "编号"
        string content_id FK, UK "内容编号"
        string provider "媒体服务商"
        int duration_seconds "时长（秒）"
    }
    "字幕轨道 subtitle_tracks" {
        string id PK "编号"
        string content_id FK "内容编号"
        string language "语言"
        string review_status "审核状态"
    }
    "视频章节 video_chapters" {
        string id PK "编号"
        string content_id FK "内容编号"
        int start_seconds "开始秒数"
        string title "标题"
    }
    "AI透明度说明 ai_transparency_cards" {
        string id PK "编号"
        string content_id FK, UK "内容编号"
        string review_status "审核状态"
    }
    "视频测验 video_quizzes" {
        string id PK "编号"
        string content_id FK "内容编号"
        string knowledge_tag_id FK "知识标签编号"
        int trigger_seconds "触发秒数"
    }
    "测验选项 video_quiz_options" {
        string id PK "编号"
        string quiz_id FK "测验编号"
        string option_key "选项键"
        boolean correct "是否正确"
    }
    "内容导入批次 content_import_batches" {
        string id PK "编号"
        string request_id UK "请求编号"
        string content_id FK "内容编号"
        string status "状态"
    }
    "每日知识 daily_facts" {
        string id PK "编号"
        string review_status "审核状态"
        date active_from "字段：active_from"
        boolean active "字段：active"
    }
    "测验作答 quiz_attempts" {
        string id PK "编号"
        string user_id FK "用户编号"
        string quiz_id FK "测验编号"
        string option_id FK "选项编号"
        boolean correct "是否正确"
    }
    "错题记录 wrong_answers" {
        string id PK "编号"
        string user_id FK "用户编号"
        string quiz_id FK "测验编号"
        datetime mastered_at "掌握时间"
    }
    "进度更新请求 progress_update_requests" {
        string request_id PK "请求编号"
        string user_id FK "用户编号"
        string content_id FK "内容编号"
        int resulting_progress_seconds "结果进度秒数"
        boolean resulting_completed "结果是否完成"
    }
    "经验值流水 xp_ledger" {
        string id PK "编号"
        string user_id FK "用户编号"
        string event_type "事件类型"
        int awarded_amount "实际奖励数量"
    }
    "成就定义 achievements" {
        string id PK "编号"
        string code UK "代码"
        string name "名称"
        boolean active "字段：active"
    }
    "用户成就 user_achievements" {
        string id PK "编号"
        string user_id FK "用户编号"
        string achievement_id FK "成就编号"
        string source_event_id FK "来源事件编号"
    }
    "游戏内容关联 game_content_links" {
        string id PK "编号"
        string game_code "游戏代码"
        string content_id FK "内容编号"
        int sort_order "排序"
    }
    "魔法游戏房间 magic_game_rooms" {
        string id PK "编号"
        string mentor_user_id FK "导师用户编号"
        string novice_user_id FK "新手用户编号"
        string next_room_id "下一房间编号"
        string status "状态"
    }
    "盲盒任务 blind_box_tasks" {
        string id PK "编号"
        string source "来源"
        string sketch_url "草图地址"
    }
    "盲盒房间 blind_box_rooms" {
        string id PK "编号"
        string boss_user_id FK "老板用户编号"
        string designer_user_id FK "设计师用户编号"
        string task_id FK "任务编号"
        string next_room_id "下一房间编号"
        string status "状态"
    }
    "谁是卧底房间 truth_game_rooms" {
        string id PK "编号"
        string undercover_user_id FK "卧底用户编号"
        string detective_user_id FK "侦探用户编号"
        string evidence_message_id "证据消息编号"
        string next_room_id "下一房间编号"
        string status "状态"
    }
    "卧底游戏消息 truth_game_messages" {
        string id PK "编号"
        string room_id FK "房间编号"
        int round_number "回合数"
        string speaker "字段：speaker"
    }
    "越狱游戏房间 jailbreak_game_rooms" {
        string id PK "编号"
        string host_user_id FK "房主编号"
        string resolving_attempt_id "结算尝试编号"
        string status "状态"
    }
    "越狱游戏成员 jailbreak_game_members" {
        string id PK "编号"
        string room_id FK "房间编号"
        string user_id FK "用户编号"
        string role "角色"
    }
    "越狱游戏音频 jailbreak_game_audio" {
        string id PK "编号"
        string room_id FK "房间编号"
        string sender_user_id "发送者用户编号"
        int round_number "回合数"
    }
    "越狱游戏尝试 jailbreak_game_attempts" {
        string id PK "编号"
        string room_id FK "房间编号"
        string operator_user_id "操作用户编号"
        int round_number "回合数"
    }
    "越狱游戏动作 jailbreak_game_actions" {
        string request_id PK "请求编号"
        string room_id FK "房间编号"
        string user_id FK "用户编号"
        string action_type "动作类型"
    }
    "账号删除审计 account_deletion_audits" {
        string request_id PK "请求编号"
        string subject_hash UK "主体哈希"
        string status "状态"
    }
    "社交资料 social_profiles" {
        string user_id PK, FK "用户编号"
        string public_profile_id UK "公开资料编号"
        string friend_code UK "好友码"
    }
    "好友请求 friend_requests" {
        string id PK "编号"
        string requester_id FK "请求者编号"
        string recipient_id FK "接收者编号"
        string status "状态"
        string request_id UK "请求编号"
    }
    "好友关系 friendships" {
        string id PK "编号"
        string user_low_id FK "低位用户编号"
        string user_high_id FK "高位用户编号"
        string latest_request_id FK "最新请求编号"
        string removed_by_user_id FK "移除者编号"
        string status "状态"
    }
    "用户屏蔽 user_blocks" {
        string id PK "编号"
        string blocker_id FK "屏蔽者编号"
        string blocked_id FK "被屏蔽者编号"
        string request_id UK "请求编号"
    }
    "游戏邀请 game_invitations" {
        string id PK "编号"
        string inviter_id FK "邀请者编号"
        string invitee_id FK "被邀请用户编号"
        string friendship_id FK "好友关系编号"
        string game_code "游戏代码"
        string room_id "房间编号"
        string status "状态"
    }
    "社区游戏大厅 community_game_listings" {
        string id PK "编号"
        string host_user_id FK "房主编号"
        string joined_user_id FK "加入用户编号"
        string game_code "游戏代码"
        string room_id "房间编号"
        string status "状态"
    }
    "通知 notifications" {
        string id PK "编号"
        string recipient_id FK "接收者编号"
        string actor_id FK "操作者编号"
        string reference_type "引用类型"
        string reference_id "引用编号"
    }
    "通知发送队列 notification_outbox" {
        string id PK "编号"
        string recipient_id FK "接收者编号"
        string aggregate_type "聚合类型"
        string aggregate_id "聚合编号"
        string status "状态"
    }
    "社区问题 community_questions" {
        string id PK "编号"
        string author_id FK "作者编号"
        string published_revision_id FK "已发布修订编号"
        string checking_revision_id FK "审核中修订编号"
        string accepted_answer_id FK "采纳回答编号"
        string question_status "问题状态"
    }
    "问题修订 community_question_revisions" {
        string id PK "编号"
        string question_id FK "字段：question_id"
        string category_id FK "分类编号"
        string linked_content_id FK "关联内容编号"
        int revision_number "修订版本号"
        string safety_status "安全状态"
    }
    "问题修订标签 community_question_revision_tags" {
        string revision_id PK, FK "修订编号"
        string tag_id PK, FK "字段：tag_id"
        int sort_order "排序"
    }
    "社区回答 community_answers" {
        string id PK "编号"
        string question_id FK "字段：question_id"
        string author_id FK "作者编号"
        string published_revision_id FK "已发布修订编号"
        string checking_revision_id FK "审核中修订编号"
        string lifecycle_status "生命周期状态"
    }
    "回答修订 community_answer_revisions" {
        string id PK "编号"
        string answer_id FK "回答编号"
        string linked_content_id FK "关联内容编号"
        int revision_number "修订版本号"
        string safety_status "安全状态"
    }
    "社区收藏 community_bookmarks" {
        string id PK "编号"
        string user_id FK "用户编号"
        string question_id FK "字段：question_id"
    }
    "社区隐藏内容 community_hidden_contents" {
        string id PK "编号"
        string user_id FK "用户编号"
        string target_type "目标类型"
        string target_id "目标编号"
    }
    "内容安全检查 content_safety_checks" {
        string id PK "编号"
        string target_type "目标类型"
        string target_id "目标编号"
        string decision "判定结果"
    }
    "社区动作请求 community_action_requests" {
        string request_id PK "请求编号"
        string user_id FK "用户编号"
        string action_type "动作类型"
        string target_id "目标编号"
    }
    "游戏交互安全检查 game_interaction_safety_checks" {
        string id PK "编号"
        string game_code "游戏代码"
        string room_id "房间编号"
        string sender_user_id FK "发送者用户编号"
        string status "状态"
    }
    "社交屏蔽请求 social_block_requests" {
        string request_id PK "请求编号"
        string blocker_id FK "屏蔽者编号"
        string blocked_id FK "被屏蔽者编号"
        string block_id FK "屏蔽记录编号"
    }
    "社交屏蔽请求锁 social_block_request_locks" {
        string request_id PK "请求编号"
        datetime created_at "创建时间"
    }
    "私聊会话 chat_conversations" {
        string id PK "编号"
        string user_low_id FK "低位用户编号"
        string user_high_id FK "高位用户编号"
    }
    "私聊消息 chat_messages" {
        string id PK "编号"
        string conversation_id FK "会话编号"
        string sender_id FK "发送者编号"
        string request_id UK "请求编号"
        string status "状态"
    }
    "私聊表情 chat_stickers" {
        string id PK "编号"
        string owner_id FK "所有者编号"
        string storage_key "存储键"
    }
    "AI助手会话 assistant_conversations" {
        string id PK "编号"
        string user_id FK "用户编号"
        string title "标题"
        boolean memory_enabled "是否启用记忆"
    }
    "AI助手消息 assistant_messages" {
        string id PK "编号"
        string conversation_id FK "会话编号"
        string author_user_id FK "作者用户编号"
        string reply_to_message_id FK "回复消息编号"
        string role "角色"
        string safety_status "安全状态"
    }
    "AI助手记忆 assistant_memory" {
        string id PK "编号"
        string user_id FK "用户编号"
        string memory_key "记忆键"
        boolean enabled "是否启用"
    }
    "AI助手推荐反馈 assistant_recommendation_events" {
        string id PK "编号"
        string user_id FK "用户编号"
        string conversation_id FK "会话编号"
        string message_id FK "消息编号"
        string content_id FK "内容编号"
        string event_type "事件类型"
    }
    "单机游戏实例 single_player_game_instances" {
        string id PK "编号"
        string user_id FK "用户编号"
        string game_code "游戏代码"
        int level_no "关卡序号"
        string status "状态"
    }
    "单机游戏提交 single_player_game_submissions" {
        string id PK "编号"
        string instance_id FK "实例编号"
        string round_id "回合编号"
        string request_id UK "请求编号"
    }
    "单机游戏进度 single_player_game_progress" {
        string user_id PK, FK "用户编号"
        string game_code PK "游戏代码"
        int level_no PK "关卡序号"
        boolean completed "是否完成"
    }

    "用户 users" ||--o{ "刷新令牌 refresh_tokens" : "拥有"
    "用户 users" ||--o| "用户偏好 user_preferences" : "配置"
    "用户 users" ||--o{ "收藏记录 favorites" : "收藏"
    "学习内容 contents" ||--o{ "收藏记录 favorites" : "被收藏"
    "用户 users" ||--o{ "观看记录 viewing_history" : "观看"
    "学习内容 contents" ||--o{ "观看记录 viewing_history" : "记录"
    "课程分类 categories" ||--o{ "学习内容 contents" : "分类"
    "学习任务 learning_tasks" ||--o{ "任务选项 task_items" : "包含"
    "学习任务 learning_tasks" ||--o{ "导师房间 mentor_rooms" : "用于"
    "用户 users" ||--o{ "导师房间 mentor_rooms" : "担任导师"
    "用户 users" ||--o{ "导师房间 mentor_rooms" : "加入"
    "导师房间 mentor_rooms" ||--o| "任务提交 task_submissions" : "接收"
    "用户 users" ||--o{ "任务提交 task_submissions" : "提交"
    "导师房间 mentor_rooms" ||--o| "导师评价 mentor_reviews" : "由导师评价"
    "用户 users" ||--o{ "导师评价 mentor_reviews" : "评价"
    "导师房间 mentor_rooms" ||--o| "学习结果 learning_results" : "产生"
    "学习内容 contents" ||--o{ "内容适用阶段 content_stages" : "适用"
    "标签 tags" ||--o{ "内容标签关联 content_tags" : "标记"
    "学习内容 contents" ||--o{ "内容标签关联 content_tags" : "已标记"
    "学习内容 contents" ||--o| "视频资源 video_assets" : "包含视频资源"
    "学习内容 contents" ||--o{ "字幕轨道 subtitle_tracks" : "包含字幕"
    "学习内容 contents" ||--o{ "视频章节 video_chapters" : "包含章节"
    "学习内容 contents" ||--o| "AI透明度说明 ai_transparency_cards" : "说明"
    "学习内容 contents" ||--o{ "视频测验 video_quizzes" : "测试"
    "标签 tags" ||--o{ "视频测验 video_quizzes" : "知识标签"
    "视频测验 video_quizzes" ||--o{ "测验选项 video_quiz_options" : "提供选项"
    "学习内容 contents" ||--o{ "内容导入批次 content_import_batches" : "导入批次"
    "用户 users" ||--o{ "测验作答 quiz_attempts" : "作答"
    "视频测验 video_quizzes" ||--o{ "测验作答 quiz_attempts" : "对应测验"
    "测验选项 video_quiz_options" ||--o{ "测验作答 quiz_attempts" : "选择"
    "用户 users" ||--o{ "错题记录 wrong_answers" : "拥有"
    "视频测验 video_quizzes" ||--o{ "错题记录 wrong_answers" : "记录"
    "用户 users" ||--o{ "进度更新请求 progress_update_requests" : "更新"
    "学习内容 contents" ||--o{ "进度更新请求 progress_update_requests" : "记录进度"
    "用户 users" ||--o{ "经验值流水 xp_ledger" : "获得"
    "用户 users" ||--o{ "用户成就 user_achievements" : "获得成就"
    "成就定义 achievements" ||--o{ "用户成就 user_achievements" : "定义"
    "经验值流水 xp_ledger" ||--o{ "用户成就 user_achievements" : "来源"
    "学习内容 contents" ||--o{ "游戏内容关联 game_content_links" : "关联"
    "用户 users" ||--o{ "魔法游戏房间 magic_game_rooms" : "参与魔法游戏"
    "用户 users" ||--o{ "盲盒房间 blind_box_rooms" : "参与盲盒游戏"
    "盲盒任务 blind_box_tasks" ||--o{ "盲盒房间 blind_box_rooms" : "使用"
    "用户 users" ||--o{ "谁是卧底房间 truth_game_rooms" : "参与卧底游戏"
    "谁是卧底房间 truth_game_rooms" ||--o{ "卧底游戏消息 truth_game_messages" : "包含"
    "用户 users" ||--o{ "越狱游戏房间 jailbreak_game_rooms" : "主持"
    "越狱游戏房间 jailbreak_game_rooms" ||--o{ "越狱游戏成员 jailbreak_game_members" : "包含成员"
    "用户 users" ||--o{ "越狱游戏成员 jailbreak_game_members" : "参与"
    "越狱游戏房间 jailbreak_game_rooms" ||--o{ "越狱游戏音频 jailbreak_game_audio" : "包含"
    "越狱游戏房间 jailbreak_game_rooms" ||--o{ "越狱游戏尝试 jailbreak_game_attempts" : "包含"
    "越狱游戏房间 jailbreak_game_rooms" ||--o{ "越狱游戏动作 jailbreak_game_actions" : "记录"
    "用户 users" ||--o{ "越狱游戏动作 jailbreak_game_actions" : "执行"
    "用户 users" ||--o| "社交资料 social_profiles" : "展示资料"
    "用户 users" ||--o{ "好友请求 friend_requests" : "发起好友请求"
    "用户 users" ||--o{ "好友请求 friend_requests" : "收到好友请求"
    "用户 users" ||--o{ "好友关系 friendships" : "低位用户"
    "用户 users" ||--o{ "好友关系 friendships" : "高位用户"
    "好友请求 friend_requests" ||--o{ "好友关系 friendships" : "最新请求"
    "用户 users" ||--o{ "好友关系 friendships" : "移除"
    "用户 users" ||--o{ "用户屏蔽 user_blocks" : "屏蔽"
    "用户 users" ||--o{ "用户屏蔽 user_blocks" : "被屏蔽"
    "用户 users" ||--o{ "游戏邀请 game_invitations" : "发起邀请"
    "用户 users" ||--o{ "游戏邀请 game_invitations" : "收到邀请"
    "好友关系 friendships" ||--o{ "游戏邀请 game_invitations" : "基于好友关系"
    "用户 users" ||--o{ "社区游戏大厅 community_game_listings" : "主持"
    "用户 users" ||--o{ "社区游戏大厅 community_game_listings" : "加入"
    "用户 users" ||--o{ "通知 notifications" : "接收"
    "用户 users" ||--o{ "通知 notifications" : "触发动作"
    "用户 users" ||--o{ "通知发送队列 notification_outbox" : "排入队列"
    "用户 users" ||--o{ "社区问题 community_questions" : "提问"
    "社区问题 community_questions" ||--o{ "问题修订 community_question_revisions" : "修订"
    "课程分类 categories" ||--o{ "问题修订 community_question_revisions" : "分类"
    "学习内容 contents" ||--o{ "问题修订 community_question_revisions" : "引用"
    "问题修订 community_question_revisions" ||--o{ "问题修订标签 community_question_revision_tags" : "已标记"
    "标签 tags" ||--o{ "问题修订标签 community_question_revision_tags" : "标记"
    "社区问题 community_questions" ||--o{ "社区回答 community_answers" : "接收"
    "用户 users" ||--o{ "社区回答 community_answers" : "回答"
    "社区回答 community_answers" ||--o{ "回答修订 community_answer_revisions" : "修订"
    "学习内容 contents" ||--o{ "回答修订 community_answer_revisions" : "引用"
    "用户 users" ||--o{ "社区收藏 community_bookmarks" : "收藏"
    "社区问题 community_questions" ||--o{ "社区收藏 community_bookmarks" : "被收藏"
    "用户 users" ||--o{ "社区隐藏内容 community_hidden_contents" : "隐藏"
    "用户 users" ||--o{ "社区动作请求 community_action_requests" : "提交"
    "用户 users" ||--o{ "游戏交互安全检查 game_interaction_safety_checks" : "发送"
    "用户 users" ||--o{ "社交屏蔽请求 social_block_requests" : "屏蔽"
    "用户屏蔽 user_blocks" ||--o{ "社交屏蔽请求 social_block_requests" : "由屏蔽请求发起"
    "用户 users" ||--o{ "私聊会话 chat_conversations" : "低位用户"
    "用户 users" ||--o{ "私聊会话 chat_conversations" : "高位用户"
    "私聊会话 chat_conversations" ||--o{ "私聊消息 chat_messages" : "包含"
    "用户 users" ||--o{ "私聊消息 chat_messages" : "发送"
    "用户 users" ||--o{ "私聊表情 chat_stickers" : "拥有"
    "用户 users" ||--o{ "AI助手会话 assistant_conversations" : "拥有"
    "AI助手会话 assistant_conversations" ||--o{ "AI助手消息 assistant_messages" : "包含"
    "用户 users" ||--o{ "AI助手消息 assistant_messages" : "撰写"
    "AI助手消息 assistant_messages" ||--o| "AI助手消息 assistant_messages" : "回复"
    "用户 users" ||--o{ "AI助手记忆 assistant_memory" : "存储"
    "用户 users" ||--o{ "AI助手推荐反馈 assistant_recommendation_events" : "产生"
    "AI助手会话 assistant_conversations" ||--o{ "AI助手推荐反馈 assistant_recommendation_events" : "关联会话"
    "AI助手消息 assistant_messages" ||--o{ "AI助手推荐反馈 assistant_recommendation_events" : "触发"
    "学习内容 contents" ||--o{ "AI助手推荐反馈 assistant_recommendation_events" : "推荐"
    "用户 users" ||--o{ "单机游戏实例 single_player_game_instances" : "开始"
    "单机游戏实例 single_player_game_instances" ||--o{ "单机游戏提交 single_player_game_submissions" : "接收"
    "用户 users" ||--o{ "单机游戏进度 single_player_game_progress" : "记录"

    %% 逻辑关联：字段存在但数据库未声明 FK
    "魔法游戏房间 magic_game_rooms" ||--o{ "魔法游戏房间 magic_game_rooms" : "下一房间（逻辑）"
    "盲盒房间 blind_box_rooms" ||--o{ "盲盒房间 blind_box_rooms" : "下一房间（逻辑）"
    "谁是卧底房间 truth_game_rooms" ||--o{ "谁是卧底房间 truth_game_rooms" : "下一房间（逻辑）"
    "谁是卧底房间 truth_game_rooms" ||--o{ "卧底游戏消息 truth_game_messages" : "证据消息（逻辑）"
    "越狱游戏房间 jailbreak_game_rooms" ||--o{ "越狱游戏尝试 jailbreak_game_attempts" : "结算尝试（逻辑）"
    "游戏邀请 game_invitations" ||--o{ "魔法游戏房间 magic_game_rooms" : "房间关联（逻辑）"
    "游戏邀请 game_invitations" ||--o{ "盲盒房间 blind_box_rooms" : "房间关联（逻辑）"
    "游戏邀请 game_invitations" ||--o{ "谁是卧底房间 truth_game_rooms" : "房间关联（逻辑）"
    "游戏邀请 game_invitations" ||--o{ "越狱游戏房间 jailbreak_game_rooms" : "房间关联（逻辑）"
    "社区游戏大厅 community_game_listings" ||--o{ "魔法游戏房间 magic_game_rooms" : "房间关联（逻辑）"
    "社区游戏大厅 community_game_listings" ||--o{ "盲盒房间 blind_box_rooms" : "房间关联（逻辑）"
    "社区游戏大厅 community_game_listings" ||--o{ "谁是卧底房间 truth_game_rooms" : "房间关联（逻辑）"
    "社区游戏大厅 community_game_listings" ||--o{ "越狱游戏房间 jailbreak_game_rooms" : "房间关联（逻辑）"
    "通知 notifications" ||--o{ "社区问题 community_questions" : "引用关联（逻辑）"
    "通知 notifications" ||--o{ "社区回答 community_answers" : "引用关联（逻辑）"
    "通知发送队列 notification_outbox" ||--o{ "社区问题 community_questions" : "聚合关联"
    "内容安全检查 content_safety_checks" ||--o{ "社区问题 community_questions" : "目标关联（逻辑）"
    "内容安全检查 content_safety_checks" ||--o{ "社区回答 community_answers" : "目标关联（逻辑）"
    "游戏交互安全检查 game_interaction_safety_checks" ||--o{ "魔法游戏房间 magic_game_rooms" : "房间关联（逻辑）"
    "游戏交互安全检查 game_interaction_safety_checks" ||--o{ "盲盒房间 blind_box_rooms" : "房间关联（逻辑）"
    "游戏交互安全检查 game_interaction_safety_checks" ||--o{ "谁是卧底房间 truth_game_rooms" : "房间关联（逻辑）"
    "游戏交互安全检查 game_interaction_safety_checks" ||--o{ "越狱游戏房间 jailbreak_game_rooms" : "房间关联（逻辑）"
```
