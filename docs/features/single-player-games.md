# 四款 AI 单机游戏

Migration: V43

## 目标

在不修改 Expo 压缩 bundle 的前提下，为社区游戏区增加四款移动端优先的独立微页面游戏。四款游戏共享同一个学习闭环：

`原始信息 -> AI 提取 -> 自己观察 -> 改变一个信息 -> 比较判断 -> 发现 AI 还不知道什么`

每款游戏只有一个统一入口。除图片侦探外，一局由一次示范、三轮挑战和一次结算组成；图片侦探只保留一关：左右对照、选择关键元素、提交后查看总结与反思。具体人物、场景、选项、图片、乐段、地图、数字、提示、讲评和发现必须实时生成。生成失败不得使用固定题目替代。

## 实现

- `frontend/dist/single-player-game.html` 是独立入口，复杂逻辑位于 `frontend/dist/single-player/`。
- `zhiqu-placeholder-games.js` 将原四张占位卡改为正式卡片，入口为 `/single-player-game?game={gameCode}`。
- 页面复用 `zhiqu.auth.session.v1`，游客可浏览游戏介绍；开局、进度和奖励要求登录。
- 公共状态机为 `INTRO -> GENERATING -> DEMO -> ROUND_ACTIVE -> EVALUATING -> FEEDBACK -> RESULT`，生成错误进入 `FAILED`；图片侦探生成完成后直接进入 `ROUND_ACTIVE`，提交 `r1` 后直接进入 `RESULT`。
- 前端内部始终发送 `levelNo = 1`，不渲染关卡目录、锁定关卡或下一关。进度只显示每款游戏“未完成/已完成”。
- 有效实例 ID 保存在本地，刷新后从服务端恢复；答案和评分规则从不保存在前端。
- 图片侦探由 AI 只生成一张完整的日常生活图。程序从完整图分别删除三个真实、类别、用途和外形均明显不同的候选元素，并交给独立视觉模型复核识别变化；影响最大的元素形成唯一缺失图，三个候选裁剪卡都来自同一张完整图。候选卡明确呈现“类别 · 用途 · 位置”，避免三个选项看似都正确。完整图与缺失图在桌面和移动端始终并排，形成找不同式对照。关键元素以真实识别影响选定，而不是来自固定题库或文本模型预设答案。
- 声音按本局结构化音符用 Web Audio 合成，并提供暂停、重复、音量、节奏条和文字替代；路线同时显示文字指标，颜色不是唯一判断依据。

## 后端边界

- Java 源码全部位于 `server/patch-src/com/zhiqu/server/singleplayer`。
- `patch-single-player-games.cjs` 从当前生成 JAR 提取编译依赖，注入新类、更新后的安全配置和 V43 迁移。
- `server/zhiqu-server.jar` 仍为不可变基线；运行包只生成在已忽略的 `server/generated`。
- 两线程、十二项队列的后台执行器负责耗时生成；实例先持久化为 `GENERATING`。
- `answer_spec_json` 只在服务端读取。实例查询只序列化 `public_content_json`。
- 原 `GameCode` 和四款多人游戏不变。单机奖励通过 `SinglePlayerRewardAdapter` 调用现有 `RewardAwarder`，不直接写 `xp_ledger`。
- V43 的 `level_no` 保留 1-12 约束以兼容旧数据；V2.0 新实例只写入 `1`，进度接口按 `gameCode` 聚合。

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
SINGLE_PLAYER_IMAGE_TIMEOUT_SECONDS=90
MEDIA_ROOT=./data/media
```

可用 `SINGLE_PLAYER_AI_TIMEOUT_SECONDS` 调整文本与视觉模型的单次请求超时，默认 35 秒，限制为 1-120 秒。图片生成使用独立的 `SINGLE_PLAYER_IMAGE_TIMEOUT_SECONDS`，默认 90 秒，限制为 30-180 秒；服务繁忙或超时时最多自动重试一次。所有密钥只在后端读取。

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
5. 在约 `390x844` 与 `1440x900` 验收单入口介绍、图片侦探的一关并排找不同、三种候选元素、提交后的总结与反思、再玩一次、返回大厅和刷新恢复；其他三款游戏继续验收示范、三轮和立即重试。
6. 未配置模型时确认明确 503 或持久化失败状态，且页面没有固定题目。

## 已知限制

- 图片关卡只有同时配置图片和独立视觉模型才可创建；没有假图片、预制图片、固定场景模板或跨用户固定素材库。文档中的小猫、马路、书包等仅用于说明，禁止作为生产题库或固定生成模板。
- Web Audio 的实际音色会受浏览器实现和设备扬声器影响，因此文字替代始终显示本局真实参数。
- 内容质量依赖外部模型遵循 JSON 约束；结构或安全校验连续失败后保留可重试失败状态。

## 回滚

从 `patch-manifest.json` 移除 `single-player-games` 补丁项并重新运行 `apply-patches.cjs`，即可从同一基线生成不含接口的运行 JAR。前端回滚独立页面与大厅卡片接入即可；V43 遵循迁移只新增原则，不删除已有表或用户进度。
