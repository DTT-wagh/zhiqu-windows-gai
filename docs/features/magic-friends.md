# 魔法游戏好友面板

Migration: V44

## 目标

将 `/magic` 右侧原公开房间改成好友游戏面板。用户能看到真实好友的在线、游戏中和离线状态；在线且未有待处理邀请的好友可以被邀请到本人新建的“画里藏词”房间。

## 实现边界

- 前端只修改 `frontend/dist/magic-reference.js`、`frontend/dist/magic-reference.css` 和相应静态测试，继续通过现有静态增强脚本挂载。
- 后端源码、V44、补丁脚本仅放在 `server/patch-src`；不修改 `server/zhiqu-server.jar`。
- 在线状态来自 `magic_friend_presence` 的服务器时间，不从公开房间、浏览器本地存储或前端固定数据推断。
- 邀请复用既有受校验的 `/api/game-invitations`；创建真实魔法房间后才发送邀请。

## 验收

1. 已登录时好友按在线、游戏中、离线顺序显示；无好友显示明确空状态。
2. 未登录显示登录入口，不发受保护接口请求。
3. 点击在线好友邀请会创建真实房间并调用现有邀请 API；离线和待处理好友按钮不可用。
4. 进入和离开魔法页面时心跳开始和停止，不影响其他游戏页面。
5. V44 可在空数据库和已有 V43 数据库上迁移，`apply-patches.cjs` 连续运行可重复生成 JAR。

## 回滚

从 `server/patch-src/patch-manifest.json` 移除 `magic-friends` 后重建运行 JAR，并回退两个魔法大厅前端文件。V44 遵循只新增原则，不删除线上表。
