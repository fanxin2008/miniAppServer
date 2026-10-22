# 刹车挑战大师 — 服务端

微信小程序后端，提供登录、昵称、每日挑战配额、挑战会话、成绩提交、个人纪录发布与排行榜能力。数据库结构见 `schema.sql`，接口契约见 `api.md`。

## 技术栈

- Node.js 18+ / Express 4
- MySQL（`mysql2/promise`，InnoDB / utf8mb4）
- JWT（jsonwebtoken）
- IP 属地离线库（ip2region，内置 IPv4/IPv6 数据，可自备库文件）

## 目录结构

```
src/
├── app.js                 # Express 应用、路由挂载、结构化错误处理
├── server.js              # 启动入口（初始化 DB 后监听 0.0.0.0）
├── config.js              # 环境变量读取
├── db.js                  # 连接池、建表、事务助手
├── middleware/auth.js     # JWT 鉴权中间件
├── routes/                # 各资源路由
├── services/              # 登录、配额、挑战、纪录、排行榜业务
└── lib/                   # 时间、校验、HTTP 错误工具
```

## 本地运行

```bash
cp .env.example .env
# 编辑 .env，填入 WECHAT_APPID / WECHAT_SECRET、JWT_SECRET 以及 DB_* 数据库配置
npm install
npm run dev
```

服务监听 `HOST:PORT`（默认 `0.0.0.0:8080`）。

## 接口

统一前缀 `/api/`，除登录外均需请求头 `Authorization: Bearer <accessToken>`。

- `GET  /health` — 健康检查，返回 `{"status":"ok"}`
- `POST /auth/wechat-login` — `{ "code": "wx.login code" }`，返回 `accessToken`、`expiresInSeconds`、`user`
- `GET  /users/me` — 当前用户 `{ id, nickname, status }`
- `PATCH /users/me` — `{ "nickname": "ljh" }` 更新昵称
- `GET  /challenges/quota` — 当天剩余次数
- `POST /challenges/start` — `{ "requestId": "..." }` 幂等创建 Session 并扣 1 次
- `POST /challenges/submit` — 提交本次挑战成绩
- `POST /records/publish` — `{ "attemptId": "...", "nickname": "可选" }` 发布个人新纪录
- `GET  /records/me/best` — 查询当前已发布最佳
- `GET  /challenges/{attemptId}/result` — 恢复挑战结果页
- `GET  /leaderboards?scope=national|province|city&limit=20&offset=0` — 排行榜
- `GET  /leaderboards/me?scope=national` — 我的实时排名

错误响应统一为 `{ "code": "机器错误码", "message": "中文提示", "requestId": "trace-id" }`。

## 关键约定

- `quota_date` 按 `TIMEZONE`（默认 `Asia/Shanghai`）日历日生成；数据库 `DATETIME(3)` 统一以 UTC 存取。
- 开始挑战时扣 1 次；同一 `requestId` 重试不重复扣次。
- 成绩提交后进入候选，用户显式发布后写入 `user_best_records`，全国/省/市榜均以该表为唯一来源。
- 排行榜排序：`best_time_ms ASC, achieved_at ASC, user_id ASC`，名次为连续唯一序号。
- IP 属地：服务端从 `x-forwarded-for` / `req.ip` 取真实 IP，经 ip2region 离线解析省/市；省榜用 GB 省级代码，市榜按城市名分组。可选手动指定 `IP2REGION_IPV4_DB` / `IP2REGION_IPV6_DB` 替换内置库。
- JSON 中的 64 位整数 ID 一律使用字符串，避免 JS 精度丢失。

## 部署

```bash
npm install --omit=dev
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

部署后建议用 Nginx 反代到 `127.0.0.1:8080`，并配置 HTTPS；数据库连接失败会记录错误并退出启动流程。
