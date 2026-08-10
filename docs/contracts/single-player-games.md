# AI 单机游戏接口契约

## 范围

本契约覆盖四款实时生成的单机游戏：

| `gameCode` | 名称 | 生成与真值 |
| --- | --- | --- |
| `prompt-writer` | 提示词小作家 | 文本模型生成题面；程序校验字段、含糊、冲突和单变量变化 |
| `image-detective` | 图片侦探 | 文本模型生成原图与单变量 `sceneSpec`，图片模型出两张图，独立视觉模型分别重新识别 |
| `sound-conductor` | 声音小指挥 | 文本模型生成结构化乐段；前端 Web Audio 合成，程序计算 BPM、力度和节拍 |
| `route-and-conditions` | 路线与条件 | 文本模型只生成抽象图和任务条件；`RouteSolver` 计算数学真值 |

除公开目录与生成媒体读取外，所有接口都要求 `Authorization: Bearer <JWT>`。写接口的 JSON 带 UUID `requestId`，客户端同时发送 `X-Request-Id`。访问其他用户的实例统一返回 `404 SINGLE_PLAYER_INSTANCE_NOT_FOUND`。

## 状态

实例只使用以下持久化状态：

- `GENERATING`：已创建，受限后台执行器正在生成。
- `READY`：内容及答案规格已校验，可开始示范和三轮挑战。
- `FAILED`：模型超时、无效 JSON、资源或结构校验最终失败，可重试。
- `REJECTED`：内容审核拒绝或后台队列已满，可用新请求重试。
- `COMPLETED`：三轮正确完成，进度与奖励已结算。

前端状态机另包含 `INTRO`、`DEMO`、`ROUND_ACTIVE`、`EVALUATING`、`FEEDBACK`、`RESULT` 和 `FAILED`。

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
    "ageBands": ["6-8", "9-10", "11-12"],
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
{"requestId":"uuid","levelNo":1,"ageBand":"6-8"}
```

- 资料有 `birth_date` 时服务端计算年龄段并忽略请求年龄段。
- 资料不足时必须传 `6-8`、`9-10` 或 `11-12`。
- `levelNo` 只接受 `1`；保留该字段是为了兼容现有数据库。
- 只向模型发送年龄段、本游戏学习目标和随机种子；不发送生日、姓名、学校、地址或联系方式。
- 返回 `202` 和 `GENERATING`。同一用户重复使用相同 `requestId` 返回原实例。
- 文本模型未配置时返回 `503 SINGLE_PLAYER_AI_NOT_CONFIGURED`。
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
  "contentVersion": "spg-v2",
  "modelName": "...",
  "content": {"instruction":"...","demo":{},"rounds":[{}, {}, {}],"result":{}},
  "failureCode": null,
  "expiresAt": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`content` 只含可渲染内容。结果包含 `evidence`、`aiCorrect`、`uncertain`、`change`、`discovery` 和 `limitation`。图片第三轮包含已经分别核验的 `beforeImageUrl` 与 `afterImageUrl`。数据库中的 `answer_spec_json`、正确选项、求解器最优路径集合和隐藏反馈不会出现在响应中。`GENERATING` 时前端约每秒轮询；普通 HTTP 请求不等待图片生成完成。

## 提交

### `POST /api/single-player-games/instances/{instanceId}/rounds/{roundId}/submit`

```json
{"requestId":"uuid","action":{"selectedIds":["option-id"]}}
```

轮次必须按 `r1`、`r2`、`r3` 顺序完成。错误提交保留当前轮次，不扣生命；新 `requestId` 可立即重试。

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

仅已完成实例可用于“再玩一次”。请求体为 `{"requestId":"uuid"}`；服务端使用同一 `gameCode`、`ageBand` 和新随机种子创建全新实例，返回 `202 GENERATING`。重复 `requestId` 返回同一新实例。

## 结算

### `POST /api/single-player-games/instances/{instanceId}/finish`

```json
{"requestId":"uuid","discovery":"可选的儿童一句观察，不含私人信息"}
```

只有 `currentRound = 3` 可以结算。服务端原子地标记实例、更新按 `gameCode` 展示的进度，并由 `SinglePlayerRewardAdapter` 调用现有 `RewardAwarder`。奖励来源键固定为 `SP:{gameCode}:L1`；重复 `finish`、换 `requestId` 或并发请求都返回首个结算结果，不重复写奖励。

## 游戏媒体

### `GET /api/single-player-games/media/{instanceId}/{key}`

读取已经通过图片规格和视觉一致性校验的本局图片。文件保存在 `MEDIA_ROOT/single-player-games/{instanceId}`，不使用 `profile-avatars`。键为随机 32 位十六进制文件名；响应带 `nosniff`，不暴露本地路径。

## 主要错误

| HTTP | `code` | 含义 |
| --- | --- | --- |
| 400 | `SINGLE_PLAYER_AGE_BAND_REQUIRED` | 资料无生日且没有选择年龄段 |
| 400 | `SINGLE_PLAYER_LEVEL_INVALID` | `levelNo` 不是 `1` |
| 400 | `SINGLE_PLAYER_PRIVATE_TEXT_REJECTED` | 结算文字含私人信息模式 |
| 404 | `SINGLE_PLAYER_INSTANCE_NOT_FOUND` | 不存在或不属于当前用户 |
| 409 | `SINGLE_PLAYER_ROUND_OUT_OF_ORDER` | 轮次顺序不正确 |
| 409 | `SINGLE_PLAYER_ROUNDS_INCOMPLETE` | 未完成三轮就结算 |
| 503 | `SINGLE_PLAYER_AI_NOT_CONFIGURED` | 文本模型未配置 |
| 503 | `SINGLE_PLAYER_IMAGE_NOT_CONFIGURED` | 图片模型未配置 |
| 503 | `SINGLE_PLAYER_VISION_NOT_CONFIGURED` | 视觉模型未配置 |

异步失败在实例的 `status` 与 `failureCode` 中返回，例如 `AI_TIMEOUT`、`AI_RESPONSE_INVALID`、`AI_CONTENT_REJECTED`、`IMAGE_VISION_MISMATCH`。前端只显示“重试生成”和“返回大厅”，不会降级成固定题目。
