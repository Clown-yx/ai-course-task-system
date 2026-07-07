# 5 人以内本地手机内测指南

本指南用于受控局域网/手机热点内测。不要把开发电脑直接暴露到公网。

## 1. 内测目标

当前可测范围：

- 学号登录。
- 首次登录强制修改初始密码。
- 每个账号只能看到自己的个人任务。
- 个人任务保存到本地 SQLite，刷新后不丢。
- 完成、恢复、移入回收站、从回收站恢复、永久删除。
- AI 解析通过后端读取 `DEEPSEEK_API_KEY`。

当前暂不测试：

- 班级管理员发布共享任务。
- 班级角色权限 UI。
- 旧 `localStorage` 批量迁移。
- 公网部署和 HTTPS。

## 2. 准备 `.env.local`

复制 `.env.example` 为 `.env.local`，并按需填写：

```powershell
DEEPSEEK_API_KEY=你的新 DeepSeek Key
DEEPSEEK_MODEL=deepseek-chat
HOST=127.0.0.1
PORT=8000
DATABASE_PATH=data/app.sqlite
INITIAL_PASSWORD=不要提交的内测初始密码
PILOT_OWNER_STUDENT_ID=你的学号
PILOT_OWNER_DISPLAY_NAME=你的显示名
PILOT_ROSTER_PATH=
```

如果只先测你自己的手机，配置 `PILOT_OWNER_STUDENT_ID` 和 `PILOT_OWNER_DISPLAY_NAME` 即可。

如果要导入多名内测用户，创建不会进入 Git 的 `rosters/pilot-users.json`：

```json
[
    { "studentId": "24000001", "displayName": "内测用户一" },
    { "studentId": "24000002", "displayName": "内测用户二" }
]
```

然后设置：

```powershell
PILOT_ROSTER_PATH=rosters/pilot-users.json
```

注意：

- 不要把真实学生名单提交到 Git。
- 不要把 `.env.local` 发给别人。
- `INITIAL_PASSWORD` 只用于首次登录，登录后必须修改。

## 3. 自检配置

运行：

```powershell
npm run pilot:check
```

自检通过后再启动服务。

## 4. 本机浏览器测试

先保持：

```powershell
HOST=127.0.0.1
```

启动：

```powershell
npm run start:env
```

访问：

```text
http://127.0.0.1:8000
```

确认：

- 能登录。
- 首次登录会进入改密页。
- 改密后能进入主页面。
- 添加任务后刷新仍存在。
- 退出后无法访问任务。

## 5. 手机热点 / 局域网测试

只有本机测试通过后，再改：

```powershell
HOST=0.0.0.0
```

重新运行：

```powershell
npm run pilot:check
npm run start:env
```

查开发电脑在热点/局域网中的 IPv4 地址：

```powershell
ipconfig
```

找到当前热点或无线网卡的 IPv4，例如：

```text
192.168.137.1
```

手机访问：

```text
http://192.168.137.1:8000
```

Windows 防火墙只允许专用网络访问。不要允许公网访问。

## 6. 5 人内测验收清单

每个内测账号都测试：

- [ ] 初始密码能登录。
- [ ] 首次登录必须改密。
- [ ] 旧密码改密后不能登录。
- [ ] 新密码可以登录。
- [ ] 能添加一条作业任务。
- [ ] 能添加一条项目任务。
- [ ] 刷新页面后任务仍存在。
- [ ] 完成任务后进入 Done。
- [ ] 恢复任务后回到 Today 或 Upcoming。
- [ ] 删除任务后进入回收站。
- [ ] 回收站恢复后任务回到看板。
- [ ] 永久删除后任务不再出现。
- [ ] A 账号看不到 B 账号任务。
- [ ] 手机断网后能看到错误，不应卡死在加载状态。

## 7. 内测后不要提交的内容

确认这些内容没有进入 Git：

- `.env.local`
- `data/*.sqlite`
- `data/*.db`
- `rosters/*.json`
- `sessions/`
- 任何真实学生名单、密码、Cookie、日志
