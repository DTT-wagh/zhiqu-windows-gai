# 游客视频播放接口契约

## 目标

已发布且审核通过的视频允许未登录用户观看。登录账号仍可获得自己的播放进度和学习记录，游客不会创建账号数据，也不会绕过收藏、练习或其他受保护操作的鉴权。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/contents/{contentId}/playback` | 公开（仅已发布视频） | 返回播放地址、清晰度、字幕和可用的账号进度 |
| PUT | `/api/history/{contentId}` | 登录 | 保存学习进度；游客由前端忽略写入，不请求受保护接口 |

## 请求

播放接口不需要请求体。前端可以省略 `Authorization`，也可以发送现有的登录令牌。

## 成功响应

```json
{
  "playbackUrl": "https://cdn.example/lesson.m3u8?token=...",
  "playAuth": null,
  "expiresAt": "2026-08-07T12:00:00Z",
  "qualities": ["AUTO", "P480", "P720"],
  "subtitles": [],
  "progressSeconds": 0,
  "completed": false
}
```

游客的 `progressSeconds` 和 `completed` 使用默认值，不读取其他账号的数据。登录后沿用原有账号隔离进度。

## 错误响应

- `404 CONTENT_NOT_FOUND`：内容不存在、未发布、未审核或没有视频资源。
- `409 VIDEO_NOT_READY`：视频资源仍在处理。
- `401 UNAUTHORIZED`：不适用于公开播放接口；收藏、练习和账号历史等其他受保护接口继续返回此错误。
- `503 VIDEO_PLAYBACK_UNAVAILABLE`：视频签名或播放服务暂时不可用。

## 兼容与验收

旧客户端仍可携带登录令牌访问，响应字段保持不变。重复 GET 请求只重新获取短期播放地址，不写入学习记录。刷新、未登录和网络失败时页面不得跳转到登录页；网络失败应保留播放器错误和重试入口。前端通过 `server/patch-src` 从不可变基线 JAR 生成运行包，不能直接修改基线 JAR。
