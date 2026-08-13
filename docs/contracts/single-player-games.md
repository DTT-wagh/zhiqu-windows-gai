# AI 单机游戏接口契约

## 范围

本契约覆盖四款实时生成的单机游戏：

| `gameCode` | 名称 | 生成与真值 |
| --- | --- | --- |
| `prompt-writer` | 提示词小作家 | 文本模型生成题面；程序校验字段、含糊、冲突和单变量变化 |
| `image-detective` | 图片侦探 | 文本模型生成本局生活场景结构；图片模型只生成一张完整图，程序分别删除三个真实候选元素并由独立视觉模型验证影响，最终只展示关键元素缺失的对照图 |
| `sound-conductor` | 声音小指挥 | 文本模型生成结构化乐段；前端 Web Audio 合成，程序计算 BPM、力度和节拍 |
| `route-and-conditions` | 路线与条件 | 文本模型只生成抽象图和任务条件；`RouteSolver` 计算数学真值 |

除公开目录与生成媒体读取外，所有接口都要求 `Authorization: Bearer <JWT>`。写接口的 JSON 带 UUID `requestId`，客户端同时发送 `X-Request-Id`。访问其他用户的实例统一返回 `404 SINGLE_PLAYER_INSTANCE_NOT_FOUND`。

## 状态

实例只使用以下持久化状态：

- `GENERATING`：已创建，受限后台执行器正在生成。
- `READY`：内容及答案规格已校验；图片侦探直接开始一关，其他游戏保留示范和三轮挑战。
- `FAILED`：模型超时、无效 JSON、资源或结构校验最终失败，可重试。
- `REJECTED`：内容审核拒绝或后台队列已满，可用新请求重试。
- `COMPLETED`：已完成本局所需轮次，进度与奖励已结算。

前端状态机另包含 `INTRO`、`DEMO`、`ROUND_ACTIVE`、`EVALUATING`、`FEEDBACK`、`RESULT` 和 `FAILED`。

服务启动时会把上一进程遗留的 `GENERATING` 实例转为可重试的 `FAILED / GENERATION_INTERRUPTED`，避免重启后页面永久停留在生成中。

## 公开目录

### `GET /api/single-player-games`

无需登录。返回四款游戏的单一入口元数据，不返回关卡目录或具体题目。

```json
[
  {
    "gameCode": "prompt-writer",
    "title": "提示词小作家",
    "subject": "语文表达、阅读理解",
    "description": "...",
    "learningGoal": "...",
    "ageBands": [],
    "estimatedMinutes": 6,
    "levelNo": 1
  }
]
```

## 进度

### `GET /api/single-player-games/progress`

固定返回四款游戏的完成状态。`ability` 只包含匿名能力指标和重试次数。旧版的多关卡进度按 `gameCode` 聚合，响应不再暴露 `levelNo`。

```json
[{"gameCode":"prompt-writer","completed":true,"ability":{},"bestResult":{},"completedAt":"...","updatedAt":"..."}]
```

## 创建与恢复

### `POST /api/single-player-games/{gameCode}/instances`

```json
{"requestId":"uuid","levelNo":1}
```

- 提示词小作家不询问年龄，请求不传 `ageBand`；服务端忽略资料生日和旧客户端传入的年龄值，始终使用相同难度。
- 其他三款游戏暂时保留年龄段兼容逻辑：资料有 `birth_date` 时由服务端计算，资料不足时传 `6-8`、`9-10` 或 `11-12`。
- `levelNo` 只接受 `1`；保留该字段是为了兼容现有数据库。
- 提示词小作家的实时模型上下文只发送统一难度策略、本游戏学习目标和随机种子，不发送年龄；其他需要实时模型的游戏仍发送年龄段。所有游戏都不发送生日、姓名、学校、地址或联系方式。
- 返回 `202` 和 `GENERATING`。同一用户重复使用相同 `requestId` 返回原实例。
- 提示词小作家可直接使用数据库审核题库，不要求文本模型配置；其他文本生成游戏未配置时返回 `503 SINGLE_PLAYER_AI_NOT_CONFIGURED`。
- 图片模型或视觉模型未配置时分别返回 `503 SINGLE_PLAYER_IMAGE_NOT_CONFIGURED`、`503 SINGLE_PLAYER_VISION_NOT_CONFIGURED`，不创建假图片实例。

### `GET /api/single-player-games/instances/{instanceId}`

```json
{
  "instanceId": "uuid",
  "gameCode": "sound-conductor",
  "levelNo": 1,
  "ageBand": "9-10",
  "status": "READY",
  "currentRound": 0,
  "contentVersion": "spg-v6",
  "modelName": "...",
  "content": {"instruction":"...","rounds":[{}],"result":{}},
  "failureCode": null,
  "expiresAt": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`content` 只含可渲染内容。结果包含 `evidence`、`aiCorrect`、`uncertain`、`change`、`discovery` 和 `limitation`。图片侦探只请求生成一张完整生活图；程序从该图分别删除三个候选元素，并用视觉模型验证哪个删除最影响目标识别。公开内容只展示完整图、关键元素缺失图和三个候选卡，左右对照图位于唯一的 `r1` 中。数据库中的 `answer_spec_json`、候选元素的关键/无关角色、正确选项、求解器最优路径集合和隐藏反馈不会出现在响应中。`GENERATING` 时前端约每秒轮询；普通 HTTP 请求不等待图片生成完成。

### 提示词小作家事实约束

`spg-v6` 起，“提示词小作家”不按年龄分层，所有用户使用同一套难度标准。三轮固定从左到右、由易到难：`r1 基础识别 -> r2 进阶核对 -> r3 综合比较`。每轮内容必须同时包含 `sourceFacts` 和 `extractedFacts`。每个原文事实都有稳定 `factId`、字段、原值及 `evidenceQuote`，其中原值和证据必须逐字存在于 `original`。AI 提取项只能通过 `sourceFactId` 引用这些原文事实，公开的 `aiExtracted` 由服务端根据已校验事实重新生成。

- `MISSING`：目标事实存在于原文事实中，但不存在于 AI 提取事实中。
- `AMBIGUITY`：含糊词必须逐字出现在目标事实的原文证据中。
- `CONFLICT`：同一个事实的原文值与 AI 提取值必须不同。
- 第 1、2 轮选项只能引用已有 `factId`，标签只显示字段和值，不提前标注“AI 已提取/未提取”；提示、反馈和前后对比由服务端按证据生成。
- 第 3 轮不采用模型自报的 `changedField`。服务端要求题干同时包含前值和后值，并从原文事实、`beforeValue`、`afterValue` 计算唯一变化，同时输出 `changedOriginal` 和 `changedAiExtracted` 供前端对照；其他选项改写为“没有改变，仍是原值”。
- 结算 `result` 由三轮已校验反馈生成，不再因为模型漏写总结字段而返回 `GAME_RESULT_INVALID`。
- 原文未出现的时间、食物或其他信息不能被描述为“AI 漏掉了”。事实关系不成立时丢弃该 AI 结果并切换审核题库，不向儿童展示错误题面。

提示词小作家采用三级内容策略：优先从 `single_player_prompt_sets` 读取统一难度的 `APPROVED + enabled` 审核题；数据库题库为空或不可用时才尝试实时模型；模型失败后使用代码内置的 `PromptBank-v1`。服务器启动时写入三套经过相同事实校验的统一难度审核题。数据库来源的实例以 `PromptBank-db:*` 标记 `modelName`，不把生成失败转交给儿童反复重试。

题库由 Flyway `V45__create_prompt_question_bank.sql` 创建。每条记录分别保存 `public_content_json` 和不得返回前端的 `answer_spec_json`，并记录年龄段、内容版本、来源、审核状态、启用状态和审核时间。后续修改已经执行过的题库结构必须新增迁移版本，不得编辑 `V45`。

## 提交

### `POST /api/single-player-games/instances/{instanceId}/rounds/{roundId}/submit`

```json
{"requestId":"uuid","action":{"selectedIds":["option-id"]}}
```

除图片侦探外，轮次必须按 `r1`、`r2`、`r3` 顺序完成。图片侦探只有 `r1`：第一次提交后立即进入总结与反思，判定结果仍会保存，用于反馈本次选择是否命中关键元素。

```json
{
  "submissionId": "uuid",
  "roundId": "r1",
  "correct": false,
  "hint": "本局动态线索",
  "feedback": "",
  "comparison": {},
  "ability": {},
  "currentRound": 0,
  "allRoundsComplete": false,
  "createdAt": "..."
}
```

唯一约束 `(instance_id, round_id, request_id)` 保证重复请求返回同一判定，不重复推进轮次。

## 重新生成

### `POST /api/single-player-games/instances/{instanceId}/retry-generation`

仅 `FAILED` 或 `REJECTED` 可调用。请求体为 `{"requestId":"uuid"}`，返回 `202 GENERATING`。

### `POST /api/single-player-games/instances/{instanceId}/regenerate`

仅已完成实例可用于“再玩一次”。请求体为 `{"requestId":"uuid"}`；服务端使用同一 `gameCode` 和新随机种子创建全新实例，返回 `202 GENERATING`。提示词小作家继续使用统一难度，其他游戏保留原实例年龄段。重复 `requestId` 返回同一新实例。

## 结算

### `POST /api/single-player-games/instances/{instanceId}/finish`

```json
{"requestId":"uuid","discovery":"可选的儿童一句观察，不含私人信息"}
```

只有完成当前游戏的全部轮次才可以结算；图片侦探为 `currentRound = 1`，其他游戏为 `currentRound = 3`。服务端原子地标记实例、更新按 `gameCode` 展示的进度，并由 `SinglePlayerRewardAdapter` 调用现有 `RewardAwarder`。奖励来源键固定为 `SP:{gameCode}:L1`；重复 `finish`、换 `requestId` 或并发请求都返回首个结算结果，不重复写奖励。

## 图片侦探内容规则

图片侦探固定只有一关。内容中必须有一张完整图、同源的缺失图和三个候选元素；完整图与缺失图需同时显示。每个候选元素都必须有不同的 `category`、`purpose` 和 `visualTrait`，且矩形区域不得重叠。响应的候选项 `description` 以“类别 · 用途 · 位置”呈现，便于儿童直接比较，而不是从相似物品中猜测。服务端会分别删除三个元素并由视觉模型核验，只有造成最大识别影响的元素可以成为正确答案。无论选择是否正确，第一次提交都会进入总结与反思，再调用 `finish` 保存结算。

## 游戏媒体

### `GET /api/single-player-games/media/{instanceId}/{key}`

读取已经通过图片规格和视觉一致性校验的本局图片。文件保存在 `MEDIA_ROOT/single-player-games/{instanceId}`，不使用 `profile-avatars`。键为随机 32 位十六进制文件名；响应带 `nosniff`，不暴露本地路径。

## 主要错误

| HTTP | `code` | 含义 |
| --- | --- | --- |
| 400 | `SINGLE_PLAYER_AGE_BAND_REQUIRED` | 非提示词小作家游戏在资料无生日且没有选择年龄段 |
| 400 | `SINGLE_PLAYER_LEVEL_INVALID` | `levelNo` 不是 `1` |
| 400 | `SINGLE_PLAYER_PRIVATE_TEXT_REJECTED` | 结算文字含私人信息模式 |
| 404 | `SINGLE_PLAYER_INSTANCE_NOT_FOUND` | 不存在或不属于当前用户 |
| 409 | `SINGLE_PLAYER_ROUND_OUT_OF_ORDER` | 轮次顺序不正确 |
| 409 | `SINGLE_PLAYER_ROUNDS_INCOMPLETE` | 未完成本局所需轮次就结算 |
| 503 | `SINGLE_PLAYER_AI_NOT_CONFIGURED` | 文本模型未配置 |
| 503 | `SINGLE_PLAYER_IMAGE_NOT_CONFIGURED` | 图片模型未配置 |
| 503 | `SINGLE_PLAYER_VISION_NOT_CONFIGURED` | 视觉模型未配置 |

异步失败在实例的 `status` 与 `failureCode` 中返回，例如 `TEXT_AI_TIMEOUT`、`IMAGE_AI_TIMEOUT`、`VISION_AI_TIMEOUT`、`AI_RESPONSE_INVALID`、`IMAGE_VISION_MISMATCH`。提示词小作家的模型错误由审核题库兜底；其他游戏仍在失败页显示“重试生成”和“返回大厅”。本地单人游戏儿童安全状态和文本扫描当前按产品要求停用，模型供应商自身的内容策略仍然有效。

文本与视觉请求使用 `SINGLE_PLAYER_AI_TIMEOUT_SECONDS`；图片生成使用独立的 `SINGLE_PLAYER_IMAGE_TIMEOUT_SECONDS`，默认 90 秒，最大 180 秒，并在超时或服务繁忙时最多自动重试一次。
