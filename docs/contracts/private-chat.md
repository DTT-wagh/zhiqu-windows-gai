# 私聊接口契约

私聊功能通过 `/api/chat` 提供，前端使用当前登录会话的 Bearer token 调用。

## 权限

- 所有接口都要求登录，未登录返回 `401 Unauthorized`。
- 搜索结果不包含当前用户，只返回状态为 `ACTIVE` 的用户。
- 私聊支持陌生人聊天请求：搜索到用户后可以先发送一条消息，不需要先知道或交换笔友码。
- 陌生人首条消息会创建 `REQUESTED` 会话；发起者只能发送这一条初始消息，接收者可以接受或暂不接受。
- 接收者接受后会话变为 `ACCEPTED`，双方可以正常收发消息；暂不接受后会话变为 `DECLINED`。
- 已建立好友关系的双方直接创建 `ACCEPTED` 会话。好友申请仍通过现有 `/api/social/friend-requests/by-profile` 接口发起。

## 接口

### 搜索用户

`GET /api/chat/users?q={账号或昵称}`

查询至少 2 个字符，最多返回 20 条结果。每项包含 `id`、`username`、`nickname`、`publicProfileId` 和 `avatarKey`。

### 会话列表

`GET /api/chat/conversations`

返回当前用户参与的会话，按最近更新时间倒序排列。每项包含对方信息、`lastMessage`、`lastAt`、`unreadCount`、`status`（`REQUESTED`、`ACCEPTED` 或 `DECLINED`）和 `requestedBy`。

### 消息列表

`GET /api/chat/conversations/{partnerId}/messages?limit=50`

要求当前用户是会话参与者。`limit` 会限制在 1 到 100，返回按时间正序排列的消息。

### 发送消息

`POST /api/chat/conversations/{partnerId}/messages`

请求体：

```json
{"body":"你好，很高兴认识你","requestId":"可选的请求幂等标识"}
```

消息正文会去除首尾空白，长度必须为 1 到 2000 个字符。成功返回创建的消息。

### 接受聊天请求

`POST /api/chat/conversations/{partnerId}/accept`

仅接收者可以接受 `REQUESTED` 会话。成功后会话状态变为 `ACCEPTED`。

### 暂不接受聊天请求

`POST /api/chat/conversations/{partnerId}/decline`

仅接收者可以暂不接受 `REQUESTED` 会话。成功后会话状态变为 `DECLINED`，对方不能继续发送消息。

### 标记已读

`POST /api/chat/conversations/{partnerId}/read`

将对方在该会话中发送的未读消息标记为已读，返回更新条数。

### 自定义图片表情

`GET /api/chat/stickers`

返回当前账号收藏的图片表情键，按收藏时间倒序排列。

`POST /api/chat/stickers`

把已经通过 `POST /api/community/images` 上传的图片登记到当前账号的表情收藏中。

```json
{"key":"0123456789abcdef0123456789abcdef.png"}
```

图片表情消息使用内部正文标记 `[[zq-sticker:{key}]]`。客户端将该标记渲染为图片，并在会话预览中显示 `[图片表情]`。
