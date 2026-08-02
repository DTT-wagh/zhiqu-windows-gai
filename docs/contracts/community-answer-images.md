# 回答图片接口契约

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/community/images` | Bearer 登录 | 上传一张回答图片 |
| GET | `/api/community/images/{key}` | 公开 | 给普通 `img` 标签读取已发布图片 |

## 上传请求

使用 `multipart/form-data`，字段名为 `image`。允许 `image/jpeg`、`image/png`、`image/gif`、`image/webp`，单张最大 5MB。服务端生成随机文件名并阻止路径穿越。

成功返回 HTTP 201：

```json
{"url":"http://localhost:8080/api/community/images/<key>.png"}
```

失败至少覆盖 400 空文件、401 未登录、413 超过 5MB、415 不支持格式、500 保存失败。

## 读取响应

成功返回 HTTP 200、图片二进制、正确 `Content-Type`、`X-Content-Type-Options: nosniff` 和长期缓存头。文件不存在返回 404。GET 不依赖浏览器自动附带 Bearer 令牌。

## 前端约定

回答正文使用 `[图片:<key>]` 标记兼容旧回答；渲染器将标记替换为图片网格。上传失败不能丢弃文字或其他已选图片；刷新和从其他页面返回后图片仍可读取。
