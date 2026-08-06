# 私聊接口契约

私聊功能通过 `/api/chat` 提供，前端使用当前登录会话的 Bearer token 调用。

## 权限

- 所有接口都要求登录，未登录返回 `401 Unauthorized`。
- 搜索结果不包含当前用户，只返回状态为 `ACTIVE` 的用户。
- 搜索到的非好友用户只能发起好友申请，不能创建会话或发送消息。
- 只有 `friendships.status = ACTIVE` 的双方可以创建 `ACCEPTED` 会话并收发消息。好友申请仍通过现有 `/api/social/friend-requests/by-profile` 接口发起。
- 消息状态为 `UNKNOWN`、`PENDING_REVIEW`、`APPROVED` 或 `REJECTED`；客户端和服务端只展示 `APPROVED`。

## 接口

### 搜索用户

`GET /api/chat/users?q={账号或昵称}`

查询至少 2 个字符，最多返回 20 条结果。每项包含 `id`、`username`、`nickname`、`publicProfileId` 和 `avatarKey`。

### 会话列表

`GET /api/chat/conversations`

返回当前用户参与的好友会话，按最近更新时间倒序排列。每项包含对方信息、`lastMessage`、`lastAt`、`unreadCount` 和 `status`（固定为 `ACCEPTED`）。未知审核状态的消息不参与预览和未读计数。

### 消息列表

`GET /api/chat/conversations/{partnerId}/messages?limit=50`

要求当前用户是会话参与者。`limit` 会限制在 1 到 100，返回按时间正序排列的消息。

### 发送消息

`POST /api/chat/conversations/{partnerId}/messages`

请求体：

```json
{"body":"你好，很高兴认识你","requestId":"可选的请求幂等标识"}
```

消息正文会去除首尾空白，长度必须为 1 到 500 个字符。手机号、QQ 号、微信号、邮箱和地址信息会被拦截。成功发送的文本消息状态为 `APPROVED`；其他状态不会展示。相同发送者的 `requestId` 会返回已有消息，避免重复发送。

### 聊天请求兼容接口

`POST /api/chat/conversations/{partnerId}/accept`

`POST /api/chat/conversations/{partnerId}/decline`

历史 `/accept` 和 `/decline` 路由保留为兼容入口，但儿童版本禁止通过聊天请求建立关系，调用会返回 `403`。请使用好友申请接口。

### 标记已读

`POST /api/chat/conversations/{partnerId}/read`

将对方在该会话中发送的未读消息标记为已读，返回更新条数。

### 系统表情

儿童版本仅提供内置 Unicode 表情。`GET /api/chat/stickers` 返回空列表，`POST /api/chat/stickers` 返回 `403`；数据库表保留以便未来扩展。
