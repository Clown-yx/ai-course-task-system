# 网页端内测与部署

## 推荐架构

```text
浏览器 → Vercel 静态页面 → /api/parse → DeepSeek API
                                  ↑
                         DEEPSEEK_API_KEY
                         仅存在服务端环境变量
```

GitHub 用于公开源码，Vercel 用于运行网页和 Serverless API。GitHub Pages 只能托管静态文件，因此可以运行手动录入和任务看板，但不能安全地直接调用 DeepSeek。

## 本地 Node.js 服务

仓库中的 `server/index.js` 可同时提供静态网页和 `/api/parse`，用于后续本地数据库及手机内测。

```powershell
Copy-Item .env.example .env.local
# 编辑 .env.local，填写仅用于本机的 DEEPSEEK_API_KEY
npm run start:env
```

默认地址为 `http://127.0.0.1:8000`，只允许开发电脑访问。需要进行热点手机测试时，将 `.env.local` 中的 `HOST` 改为 `0.0.0.0`，然后使用开发电脑的热点 IPv4 地址访问。该设置只适用于受控的专用网络，不得直接暴露到公网。

## 上线前必须完成

1. 登录 DeepSeek 控制台，立即删除曾写入 `app.js` 的旧 Key。
2. 创建一个新 Key，不要把它写入任何前端文件或提交到 Git。
3. 为 DeepSeek 账户设置合理的余额或用量限制。

## Vercel 部署步骤

1. 将本项目发布为 GitHub 公共仓库。
2. 登录 Vercel，选择 **Add New → Project**，导入该仓库。
3. Framework Preset 选择 **Other**，保持默认构建设置。
4. 在项目 **Settings → Environment Variables** 中添加：
   - Name：`DEEPSEEK_API_KEY`
   - Value：新生成的 DeepSeek Key
   - Environment：至少勾选 Preview 和 Production
5. 点击 Deploy。部署完成后，打开分配的 HTTPS 地址。
6. 粘贴一条虚构课程通知，验证 AI 回填、确认和看板流程。

## 内测控制

- 小范围测试优先使用 Vercel Preview 部署，不在公开页面展示生产链接。
- 免费方案可在 **Settings → Deployment Protection** 中为预览部署启用 **Vercel Authentication**。测试者需要通过 Vercel 账号获得访问权限。
- Vercel 的密码保护需要 Enterprise，或 Pro 的付费高级保护附加项，不应把它当作免费方案的默认能力。
- 不要把“隐藏链接”当作安全措施；公开接口仍可能被扫描和滥用。
- 限制参与人数，使用虚构课程通知，不上传真实姓名、学号或隐私信息。
- 观察 Vercel 函数日志与 DeepSeek 用量，出现异常请求立即更换 Key。

## GitHub Pages

若只演示无 AI 的静态功能，可在 GitHub 仓库 **Settings → Pages** 中选择从 `main` 分支根目录部署。页面可直接加载，手动录入、看板和本地存储正常工作；AI 解析会因没有服务端代理而不可用。

## 官方参考

- [Vercel：从 Git 仓库部署](https://vercel.com/docs/deployments/overview)
- [Vercel：环境变量](https://vercel.com/docs/environment-variables)
- [Vercel：部署访问保护](https://vercel.com/docs/deployment-protection)
- [GitHub：创建 Pages 站点](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## 本地检查

```powershell
node --check app.js
node --check api/parse.js
npm test
npm run start:env
```

访问 `http://127.0.0.1:8000` 可检查静态页面和同源 API。没有配置 Key 时，手动录入仍可使用，AI 接口会返回 `503`。
