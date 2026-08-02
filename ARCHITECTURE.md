# 智趣 AI 学堂协作架构

## 项目基线

- 前端运行在 `http://localhost:8082`，入口为 `frontend/serve-static.cjs`，实际页面资源在 `frontend/dist`。
- 前端增强功能使用独立的 `frontend/dist/zhiqu-<feature>.js` 脚本，通过统一入口注入。
- 后端运行在 `http://localhost:8080`。当前交付包以 `server/zhiqu-server.jar` 作为不可变基线，生成运行包位于被忽略的 `server/generated/zhiqu-server.jar`。
- 后端没有可直接合并的完整 Java 源码；需要变更后端时，应提交 `server/patch-src` 的源码、补丁脚本和接口契约，不应直接提交修改后的基线 JAR。
- `server/data`、`server/logs` 和 `server/.env` 只属于本地运行环境。

## 模块边界

| 模块 | 负责人 | 允许修改 | 集成要求 |
| --- | --- | --- | --- |
| 社区/资料页交互 | 前端负责人 | 对应 `zhiqu-*.js`、契约和功能说明 | 不直接改 `serve-static.cjs` |
| 后端接口与数据库 | 后端负责人 | `server/patch-src`、契约和迁移登记 | 不直接改基线 JAR |
| 注入入口与发布包 | 集成负责人 | `frontend/serve-static.cjs`、`apply-patches.cjs`、清单 | 合并前统一处理 |
| 回归与视觉验收 | 集成负责人 | 验收记录、缺陷说明 | 使用干净数据库和两个账号 |

## 不变量

1. 所有新增 DOM 增强必须有唯一 `data-*` 标记，重复执行不能重复挂载。
2. 全局 `fetch`、`MutationObserver`、路由监听只能增加可组合的包装，不能覆盖其他功能的处理器。
3. 接口变更先更新 `docs/contracts`，再修改调用方；错误响应也属于接口契约。
4. 数据库迁移只新增不修改，编号从 `docs/MIGRATION_REGISTRY.md` 领取。
5. 生成的 JAR 必须从相同基线和清单重建，不能把本地生成物当作源码合并。

## 分支模型

- `main`：可发布版本，只接受经过回归的合并提交。
- `develop`：集成分支，所有功能分支从这里创建并合并。
- `feat/<feature>`：一项完整功能的分支，不跨功能修改共享入口。
- `fix/<issue>`：缺陷修复分支，仍需通过同样的契约和回归流程。

## 运行与发布

执行 `start-demo.cmd` 会先由 `server/patch-src/apply-patches.cjs` 从基线构建生成 JAR，再启动后端和前端。发布前必须记录基线 SHA-256、补丁清单和浏览器验收结果。
