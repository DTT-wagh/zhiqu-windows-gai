# 魔法游戏好友面板接口契约

Migration: V44

## 范围

魔法游戏大厅只展示当前用户的真实好友，不再展示公开房间列表。所有接口需要现有 `Authorization: Bearer <JWT>`；未登录返回统一的 `401 UNAUTHORIZED`。

## 读取好友状态

`GET /api/magic/friends`

```json
{
  "items": [
    {
      "friendshipId": "uuid",
      "publicProfileId": "profile-id",
      "nickname": "小画家",
      "avatarKey": "avatar-key",
      "status": "ONLINE",
      "activeRoomId": null,
      "pendingGameInvitation": false
    }
  ],
  "serverNow": "2026-08-11T00:00:00Z"
}
```

`status` 只可为 `ONLINE`、`IN_GAME`、`OFFLINE`。服务端按最近 90 秒的魔法页面心跳判定在线；`IN_GAME` 只有在该好友仍是有效魔法房间成员时返回，并携带 `activeRoomId`。响应绝不包含非好友或好友的账号 ID。

## 在线心跳

`POST /api/magic/friends/presence`

```json
{"activeRoomId":"可选的当前魔法房间 UUID"}
```

客户端进入 `/magic` 或 `/magic/{roomId}` 后立即发送，随后每 25 秒发送一次。`activeRoomId` 必须是当前用户仍在其中的有效魔法房间；不合法、已结束或不属于当前用户时会被服务端清空，不能伪造“游戏中”。响应与 `GET /api/magic/friends` 相同。

## 邀请流程

前端不新增邀请接口，复用既有接口：

1. `POST /api/magic-game-rooms`，请求 `{"requestId":"uuid"}`，取得当前用户创建的真实魔法房间 `id`。
2. `POST /api/game-invitations`，请求：

```json
{
  "requestId": "uuid",
  "friendshipId": "好友关系 UUID",
  "gameCode": "MAGIC",
  "mode": "USE_EXISTING_ROOM",
  "roomId": "步骤 1 返回的 id",
  "taskMode": null
}
```

现有邀请服务负责校验好友关系、房间归属、房间可邀请状态与幂等性。前端不得以本地状态假装邀请成功。

## 错误

`GET` 和心跳网络失败时保留上一轮列表，并显示“暂时无法刷新好友状态”。邀请失败时保留按钮可重试，原样显示服务端的安全错误消息。离线或已有待处理邀请的好友不允许发起重复邀请。
