# AI 助手接口契约

状态：已实现  
Migration: V42  
基线路由：`/api/assistant`  
鉴权：所有接口均使用现有 Bearer JWT，不开放游客写入或读取。

## 通用约束

- API 密钥只从服务端 `app.ai` 读取，实际环境变量为 `DASHSCOPE_BASE_URL`、`DASHSCOPE_API_KEY` 和 `DASHSCOPE_MODEL`。
- 前端不得接收或缓存 API 密钥。
- 消息正文最大 2000 字。
- `requestId` 为 UUID 字符串；发送消息和反馈使用唯一索引保证幂等。
- 模型返回必须通过结构、安全状态、来源 ID 和推荐内容 ID 校验。
- 未配置模型时返回 `503 AI_NOT_CONFIGURED`，不返回本地模拟回复。
- 对话接口不会修改学习进度、收藏、错题、奖励或其他用户数据。
- 当前会话中出现完全匹配的隐藏激活句 `心爱的少女在哪里？` 后，服务端将该会话标记为隐藏语气模式：激活回复固定为 `我爱你`，后续仍由真实模型生成，并继续执行未成年人保护、来源校验和推荐对象校验。
- 隐藏语气模式只采用“温柔、神秘、略带童话感”等抽象表达特征，不声称自己是现有作品角色，也不复述受版权保护作品的固定台词、身份、剧情或世界观。

## GET /api/assistant/config

返回模型是否可用，不暴露密钥和完整服务地址。

```json
{
  "configured": true,
  "model": "qwen3.7-flash",
  "longTermMemoryDefault": false,
  "maxMessageCharacters": 2000,
  "recentMessageLimit": 12
}
```

## GET /api/assistant/conversations

返回当前账号未删除的会话，按更新时间倒序。会话和消息不可跨账号读取。

## POST /api/assistant/conversations

请求：

```json
{
  "memoryEnabled": false
}
```

创建会话时由模型根据北京时间、用户昵称、学习进度、收藏和错题动态生成首次问候。成功返回 `201`：

```json
{
  "conversation": {
    "id": "uuid",
    "title": "AI 助手 08-07 14:20",
    "summary": "模型生成的动态摘要",
    "memoryEnabled": false,
    "createdAt": "2026-08-07T06:20:00Z",
    "updatedAt": "2026-08-07T06:20:00Z",
    "latestMessage": {}
  },
  "messages": []
}
```

模型调用失败时不会插入一个带伪造欢迎语的新会话。

## GET /api/assistant/conversations/{id}/messages

按创建时间返回当前会话的消息。助手消息包含：

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "role": "ASSISTANT",
  "body": "动态生成的回复",
  "intent": "CHAT",
  "sources": [],
  "recommendations": [],
  "safety": {
    "status": "SAFE",
    "reason": ""
  },
  "requestId": null,
  "createdAt": "2026-08-07T06:21:00Z"
}
```

## DELETE /api/assistant/conversations/{conversationId}/messages/{messageId}

删除当前账号当前会话中的单条消息并返回 `204`。删除助手消息只删除该助手消息；删除用户消息时同时删除它直接关联的助手回复，保持问答对完整，不会删除整个会话。消息删除使用真实数据库操作，并受会话归属鉴权保护。

## POST /api/assistant/conversations/{id}/messages

请求：

```json
{
  "requestId": "uuid",
  "content": "我不太明白机器学习是怎么找规律的",
  "memoryEnabled": false
}
```

响应同时返回用户消息和助手消息：

```json
{
  "userMessage": {},
  "assistantMessage": {
    "intent": "QUESTION",
    "sources": [
      {
        "id": "真实内容 ID",
        "type": "CONTENT",
        "title": "真实标题",
        "excerpt": "真实摘要",
        "href": "/content/真实内容 ID"
      }
    ],
    "recommendations": []
  }
}
```

相同 `requestId` 重试时返回已存在的消息交换，不重复保存。并发请求通过用户消息 `request_id` 和助手消息 `reply_to_message_id` 唯一索引收敛。

前端的失败重试复用原始 `requestId`，重新生成使用新的 `requestId` 调用消息发送接口；服务端仍按真实模型生成回复，不返回前端伪造内容。

首条用户消息成功保存后，服务端使用经过隐私脱敏的消息正文作为会话标题，并截取前 36 个字符。后续消息只更新会话摘要和更新时间，不覆盖用户已经形成的标题。前端可以先显示本地状态，随后以会话列表接口返回的服务端标题为准。

## PUT /api/assistant/conversations/{conversationId}/messages/{messageId}

编辑当前会话最近一条用户消息，并重新生成它直接关联的 AI 回复。请求体与发送消息接口相同，`requestId` 用于编辑请求幂等控制；编辑失败后重试时继续使用同一个 `requestId`。

服务端在同一事务内完成用户正文更新、旧回复替换、来源与推荐重新校验、会话摘要更新和可选长期记忆更新。AI 调用失败时事务回滚，原用户消息和原 AI 回复保持不变。成功响应同样为 `MessageExchangeResponse`，用户消息 ID 和助手回复 ID 均保持不变，页面刷新后不会恢复旧内容或出现重复问答。

只有最近一条用户消息允许编辑；其他消息返回 `409 ASSISTANT_EDIT_NOT_LATEST`。接口沿用现有登录鉴权和会话归属校验。

隐藏语气模式不新增请求字段。服务端根据当前会话中真实保存的用户消息判断是否激活，因此刷新、重新进入会话和后续消息请求均保持一致；删除或编辑掉唯一激活消息后自动恢复默认语气。

## GET /api/assistant/recommendations

返回实时数据库中已发布、已审核且资源有效的内容候选。排序使用当前账号的未完成进度、收藏和内容权重，不读取前端硬编码数组。该接口供诊断和未来工具调用；聊天中的推荐仍由模型从相同候选池选择并由服务端二次校验。

## POST /api/assistant/feedback

```json
{
  "requestId": "uuid",
  "messageId": "助手消息 ID",
  "contentId": "可选的真实内容 ID",
  "helpful": true
}
```

反馈只允许关联当前账号的助手消息。`contentId` 存在时必须对应已发布内容。

## DELETE /api/assistant/conversations/{id}

软删除当前账号的会话并返回 `204`。删除后列表和消息接口不可再读取该会话；底层外键支持账号清理。

## 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录或令牌失效 |
| 404 | `ASSISTANT_NOT_FOUND` | 会话、消息或推荐对象不存在 |
| 409 | `ASSISTANT_REQUEST_CONFLICT` | 幂等请求发生冲突 |
| 409 | `ASSISTANT_EDIT_NOT_LATEST` | 只能编辑当前会话最近一条用户消息 |
| 429 | `ASSISTANT_RATE_LIMITED` | 每账号每分钟请求数超限 |
| 502 | `AI_RESPONSE_INVALID` | 模型结构未通过校验 |
| 502 | `AI_SOURCE_VALIDATION_FAILED` | 学习解答缺少真实来源 |
| 503 | `AI_NOT_CONFIGURED` | 服务端未配置模型 |
| 503 | `AI_UNAVAILABLE` | 无法连接模型服务 |
| 504 | `AI_TIMEOUT` | 模型响应超时 |
