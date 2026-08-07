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

前端的失败重试复用原始 `requestId`，重新生成和编辑重新发送使用新的 `requestId` 调用同一接口；服务端仍按真实模型生成回复，不返回前端伪造内容。

首条用户消息成功保存后，服务端使用经过隐私脱敏的消息正文作为会话标题，并截取前 36 个字符。后续消息只更新会话摘要和更新时间，不覆盖用户已经形成的标题。前端可以先显示本地状态，随后以会话列表接口返回的服务端标题为准。

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
| 429 | `ASSISTANT_RATE_LIMITED` | 每账号每分钟请求数超限 |
| 502 | `AI_RESPONSE_INVALID` | 模型结构未通过校验 |
| 502 | `AI_SOURCE_VALIDATION_FAILED` | 学习解答缺少真实来源 |
| 503 | `AI_NOT_CONFIGURED` | 服务端未配置模型 |
| 503 | `AI_UNAVAILABLE` | 无法连接模型服务 |
| 504 | `AI_TIMEOUT` | 模型响应超时 |
