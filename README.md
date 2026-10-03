# UDL 游戏唯一主站

正式入口为 https://playgameaby.netlify.app。2048 使用 /2048，办公室说小话使用 /office，同事老虎机使用 /slot/。所有新游戏均部署在同一主站，不再建立独立游戏站点。

Netlify playgameaby 项目代理唯一主服务 udl-colleague-play.ababyabyaby.chatgpt.site。三款游戏共用主站登录 Cookie、同事名单、主站 D1 数据库和 R2 素材库。老虎机 /api/slot/* 接口、原生 WASM 引擎和存档在主站运行，不再请求旧老虎机服务。

后台从 /admin 进入，经跳转在原主站验证所有者身份。服务间迁移接口与媒体初始化路径不对外开放；客户端传入的身份头和 Authorization 不转发。保留来源校验、Cookie 安全属性和 private/no-store 缓存策略。

旧老虎机 Netlify 地址仅过渡跳转至主站 /slot/，迁移验证后删除旧项目。游戏实际源代码和后续发布说明见主站源码中的 AGENTS.md。

本地检查：node --test worker.test.mjs。国内可达性需针对正式主站实测；节点 HTTP 检测不能代替手机实际登录、游玩与存档测试。
