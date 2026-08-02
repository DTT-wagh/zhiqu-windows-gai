# 两人并行开发与合并流程

## 开始开发

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c feat/<feature-name>
git config core.hooksPath .githooks
```

每项功能先创建 `docs/contracts/<feature>.md` 和 `docs/features/<feature>.md`。前者描述接口，后者描述目标、允许修改的文件、验收步骤、已知限制和回滚方法。

## 提交前

```powershell
git fetch origin
git rebase origin/develop
git diff --check
git status --short
```

提交说明必须包含功能目标、接口变化、迁移、测试路径和回滚方式。禁止直接在 `main` 提交；本地钩子会阻止 `main` 提交、敏感文件提交和基线 JAR 提交。

## 合并顺序

1. 后端接口契约和数据库迁移。
2. 后端补丁脚本及补丁清单。
3. 前端请求、状态和错误展示。
4. 前端视觉与浏览器验收。
5. 干净数据库、双账号、刷新和前进后退回归。

集成负责人逐个合并，不要同时合并多个修改了同一共享入口的分支。发生冲突时先对照契约和验收用例，再手动合并，不能机械选择“保留我方”或“保留对方”。

## Codex 任务模板

```text
你在分支 feat/<功能名> 开发，基线为 develop 最新提交。
只实现 docs/features/<功能名>.md 中的功能，遵守 docs/contracts/<功能名>.md。
不要修改 main、develop、.env、server/data、日志或其他功能脚本。
不要直接修改 server/zhiqu-server.jar；如需后端改动，只提交 patch-src 源码和可重复执行的补丁脚本。
不要修改 frontend/serve-static.cjs；将需要注入的脚本、加载顺序和原因写入交接说明。
完成后提供修改文件、接口变化、迁移、浏览器验收步骤和已知风险。
```

## 合并验收

- 登录、注册、资料保存、社区提问、回答发布和图片加载。
- 两个独立账号的游戏房间流程。
- 页面刷新、前进后退、移动端宽度、未登录和网络失败。
- 从空数据库启动，确认迁移和补丁可重复执行。
