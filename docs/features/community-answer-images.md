# 回答图片功能交接

## 目标与用户路径

在问题详情页展开回答编辑器，选择图片、查看缩略图、删除或提交；回答发布后显示图片网格，点击可全屏预览。

## 允许修改的文件

- 前端：独立的回答图片增强脚本和统一注入登记。
- 后端：`server/patch-src` 中的控制器、补丁脚本和接口契约。
- 不直接修改 `server/zhiqu-server.jar`。

## 依赖

`docs/contracts/community-answer-images.md`。数据库无迁移。

## 验收

验证最多 9 张、单张 5MB、格式拒绝、上传进度、发布后刷新、匿名 GET、全屏预览、关闭、未登录上传失败和网络失败保留草稿。

## 已知限制与回滚

基线包以 JAR 形式提供；回滚时从 `patch-manifest.json` 移除本功能补丁并重新生成 `server/generated/zhiqu-server.jar`。
