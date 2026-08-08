# 四款 AI 单机游戏

Migration: V43

## 目标

在不修改 Expo 压缩 bundle 的前提下，为社区游戏区增加四款移动端优先的独立微页面游戏。四款游戏共享同一个学习闭环：

`原始信息 -> AI 提取 -> 自己观察 -> 改变一个信息 -> 比较判断 -> 发现 AI 还不知道什么`

每款 12 关的学习目标可以固定，具体人物、场景、选项、图片、乐段、地图、数字、提示、讲评和发现必须实时生成。生成失败不得使用固定题目替代。

## 实现

- `frontend/dist/single-player-game.html` 是独立入口，复杂逻辑位于 `frontend/dist/single-player/`。
- `zhiqu-placeholder-games.js` 将原四张占位卡改为正式卡片，入口为 `/single-player-game?game={gameCode}&level={levelNo}`。
- 页面复用 `zhiqu.auth.session.v1`，游客可浏览介绍和 48 个关卡目标；开局、进度和奖励要求登录。
- 公共状态机为 `INTRO -> GENERATING -> DEMO -> ROUND_ACTIVE -> EVALUATING -> FEEDBACK -> RESULT`，生成错误进入 `FAILED`。
- 有效实例 ID 保存在本地，刷新后从服务端恢复；答案和评分规则从不保存在前端。
- 图片带实时 alt；声音按本局结构化音符用 Web Audio 合成，并提供暂停、重复、音量、节奏条和文字替代；路线同时显示文字指标，颜色不是唯一判断依据。

## 后端边界

- Java 源码全部位于 `server/patch-src/com/zhiqu/server/singleplayer`。
- `patch-single-player-games.cjs` 从当前生成 JAR 提取编译依赖，注入新类、更新后的安全配置和 V43 迁移。
- `server/zhiqu-server.jar` 仍为不可变基线；运行包只生成在已忽略的 `server/generated`。
- 两线程、十二项队列的后台执行器负责耗时生成；实例先持久化为 `GENERATING`。
- `answer_spec_json` 只在服务端读取。实例查询只序列化 `public_content_json`。
- 原 `GameCode` 和四款多人游戏不变。单机奖励通过 `SinglePlayerRewardAdapter` 调用现有 `RewardAwarder`，不直接写 `xp_ledger`。

## AI 配置

文本生成复用：

```properties
DASHSCOPE_BASE_URL=
DASHSCOPE_API_KEY=
DASHSCOPE_MODEL=qwen3.7-flash
```

图片侦探另外要求：

```properties
MAGIC_IMAGE_BASE_URL=
MAGIC_IMAGE_API_KEY=
MAGIC_IMAGE_MODEL=
SINGLE_PLAYER_VISION_BASE_URL=
SINGLE_PLAYER_VISION_API_KEY=
SINGLE_PLAYER_VISION_MODEL=
MEDIA_ROOT=./data/media
```

可用 `SINGLE_PLAYER_AI_TIMEOUT_SECONDS` 调整单次模型请求超时，默认 35 秒，限制为 1-120 秒。所有密钥只在后端读取。

## 允许修改的文件

- 新增 `frontend/dist/single-player-game.html`、`frontend/dist/single-player/*` 和单机测试。
- 修改 `frontend/dist/zhiqu-placeholder-games.js` 与 `frontend/serve-static.cjs` 的独立入口接入。
- 新增 `server/patch-src/com/zhiqu/server/singleplayer/*`、V43、补丁脚本和测试。
- 在 `SecurityConfig.java` 中仅公开目录与生成媒体 GET。
- 更新补丁清单、迁移登记、契约和本说明。

## 验收

1. 运行 `node frontend/tests/zhiqu-single-player.test.cjs`。
2. 运行路线求解器单元测试和单机 API 测试。
3. 连续两次运行 `node server/patch-src/apply-patches.cjs`，均从基线成功生成运行 JAR。
4. 打开 `http://localhost:8082/community?section=games`，确认四张卡可点击。
5. 在约 `390x844` 与 `1440x900` 验收目录、示范、三轮、立即重试、结算、返回大厅和刷新恢复。
6. 未配置模型时确认明确 503 或持久化失败状态，且页面没有固定题目。

## 已知限制

- 图片关卡只有同时配置图片和独立视觉模型才可创建；没有假图片或跨用户固定素材库。
- Web Audio 的实际音色会受浏览器实现和设备扬声器影响，因此文字替代始终显示本局真实参数。
- 内容质量依赖外部模型遵循 JSON 约束；结构或安全校验连续失败后保留可重试失败状态。

## 回滚

从 `patch-manifest.json` 移除 `single-player-games` 补丁项并重新运行 `apply-patches.cjs`，即可从同一基线生成不含接口的运行 JAR。前端回滚独立页面与大厅卡片接入即可；V43 遵循迁移只新增原则，不删除已有表或用户进度。
