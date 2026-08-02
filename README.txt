智趣 AI 学堂 Windows 演示包

1. 安装 Java 17 和 Node.js LTS。
2. 如果要启用 AI 功能，把 server\.env.example 复制为 server\.env，填写 API 密钥。
3. 双击 start-demo.cmd。
4. 浏览器打开 http://localhost:8082。

后端地址：http://localhost:8080
健康检查：http://localhost:8080/actuator/health

首次运行会在 server\data 中创建本地 H2 数据库。关闭演示时可关闭两个命令行窗口。

不要把填写了真实密钥的 server\.env 发给其他人，也不要提交到 Git。
