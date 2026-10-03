# UDL Netlify 游戏入口

这份工程把现有 Cloudflare Worker 入口逻辑适配为 Netlify Edge Function。正式域名按项目约定固定为：

- `https://udl-game-as9irin.netlify.app`
- `https://udl-slot-as9irin.netlify.app`

这两个地址只是预期部署域名；本工程尚未发布，在线代理和手机访问均未验证。

## 部署结构

Netlify 的默认 `*.netlify.app` 域名由项目名决定，因此需在 Netlify 中分别建立两个项目，项目名分别为 `udl-game-as9irin` 和 `udl-slot-as9irin`，然后将同一工程部署到两个项目。部署后入口只接受以上两个精确 HTTPS 主机名；Deploy Preview、分支预览和其他主机返回 503。若项目名被占用，目标正式域名无法按约定取得，需先解决命名冲突。

工程目录可通过 Netlify 网页的 Git 部署连接。部署配置位于 `netlify.toml`，静态发布目录为 `public`，Edge Function 位于 `netlify/edge-functions/entry.js`，路由覆盖 `/*`。Netlify Edge Functions 默认不缓存；配置中没有启用缓存规则，代理响应同时带有 `Cache-Control: private, no-store`。

## 代理行为与隐私边界

代理只使用原 Worker 中固定的两个上游。它保留 GET、HEAD、POST、会话 Cookie 和私有头像访问所需的会话语义，POST 保留来源校验；共享名单与媒体种子接口仍被拒绝，管理入口仍返回原站。没有添加数据库、名单、头像素材、凭证或主动 `console` 日志。

部署只转发用户原本已获准访问的原游戏内容。它不改变原游戏登录权限、共享名单或存档存储；这里的代理适配也不能证明目标手机网络能够访问新域名。Netlify 平台自身可能记录运行追踪，代码不输出 Cookie 或请求正文。

## 本地检查

```sh
npm test
```

## 官方配置依据

- [Netlify Edge Functions handler API](https://docs.netlify.com/build/edge-functions/api/)
- [Netlify Edge Functions declarations and paths](https://docs.netlify.com/build/edge-functions/declarations/)
- [Netlify Edge Functions response caching](https://docs.netlify.com/build/edge-functions/optional-configuration/)
- [Deno Fetch Headers API: getSetCookie](https://docs.deno.com/api/web/fetch/)
