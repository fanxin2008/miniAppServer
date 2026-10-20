# shache-server

微信小程序服务端，提供登录、每日游戏次数管理、访问上报与参与游戏扣次能力。

## 功能

- 微信小程序登录：`wx.login` 获取 code，服务端调用 `jscode2session` 换取 openid，并签发 JWT。
- 每日游戏次数：每个用户每天 10 次（可通过 `DAILY_PLAY_LIMIT` 调整），按 `TIMEZONE` 时区 0 点重置。
- 访问上报：用户进入游戏页时上报一次，只累计访问数，不消耗游戏次数。
- 参与游戏：每参与一次扣减 1 次，次数用尽返回 429。

## 技术栈

- Node.js 22.5+ / Express 4
- SQLite（Node 内置 `node:sqlite`，无需原生依赖）
- JWT（jsonwebtoken）

> 为什么用 `node:sqlite`：它随 Node 内置，部署时无需安装编译工具，也无需从 GitHub 下载预编译二进制，在腾讯云上开箱即用。

## 目录结构

```
src/
├── app.js               # Express 应用与路由挂载
├── server.js            # 启动入口
├── config.js            # 环境变量读取
├── db.js                # SQLite 初始化
├── middleware/auth.js   # JWT 鉴权中间件
├── routes/auth.js       # 登录接口
├── routes/game.js       # 游戏次数接口
└── services/
    ├── wechat.js        # jscode2session 调用
    └── game.js          # 次数查询/访问/扣次
```

## 本地运行

要求 Node 22.5+（Node 22.x 启动参数已内置 `--experimental-sqlite`，Node 24+ 会自动忽略该参数）。

```bash
cp .env.example .env
# 编辑 .env，填入 WECHAT_APPID / WECHAT_SECRET，并修改 JWT_SECRET
npm install
npm run dev
```

## 接口

统一响应格式：`{ code, message, data }`，`code` 为 0 表示成功；鉴权使用请求头 `Authorization: Bearer <token>`。

- `GET  /health` — 健康检查
- `POST /api/auth/login` — 入参 `{ "code": "wx.login 返回的 code" }`，返回 `{ token, isNewUser }`
- `GET  /api/game/status` — 返回 `{ date, total, used, remaining, visits }`
- `POST /api/game/visit` — 访问上报一次，返回同上结构
- `POST /api/game/play` — 参与游戏扣 1 次，返回同上结构；次数用尽返回 429

## 小程序端示例

```js
// 登录
wx.login({
  success(res) {
    wx.request({
      url: 'https://你的域名/api/auth/login',
      method: 'POST',
      data: { code: res.code },
      success(r) {
        if (r.data.code === 0) {
          wx.setStorageSync('token', r.data.data.token);
        }
      },
    });
  },
});

// 查询剩余次数
wx.request({
  url: 'https://你的域名/api/game/status',
  header: { Authorization: 'Bearer ' + wx.getStorageSync('token') },
  success(r) {
    console.log(r.data.data); // { total, used, remaining, visits }
  },
});

// 参与游戏（在游戏结算时调用，扣 1 次）
wx.request({
  url: 'https://你的域名/api/game/play',
  method: 'POST',
  header: { Authorization: 'Bearer ' + wx.getStorageSync('token') },
  success(r) {
    if (r.data.code === 429) {
      wx.showToast({ title: '今日次数已用完', icon: 'none' });
    }
  },
});
```

## 腾讯云部署（Lighthouse / CVM）

```bash
# 1. 安装 Node.js 22.5+（推荐 nvm 或官方二进制，无需额外编译工具）

# 2. 拉取代码并安装依赖
git clone <仓库地址> && cd shache-server
cp .env.example .env   # 填入真实配置
npm install --omit=dev

# 3. 使用 PM2 常驻运行
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

> `ecosystem.config.cjs` 已通过 `node_args` 带上 `--experimental-sqlite`，直接用 `pm2 start ecosystem.config.cjs` 即可。

部署后建议用 Nginx 反代到 `127.0.0.1:3000`，配置 HTTPS 域名，并在微信公众平台「开发管理 → 开发设置 → 服务器域名」中把该域名加入 request 合法域名。

## 数据说明

- 数据存储在 `DB_PATH` 指向的 SQLite 文件（默认 `data/shache.db`），WAL 模式。
- `users` 保存用户，`game_records` 按 `(openid, date)` 记录每天的访问数与已玩次数，历史数据可用于统计。
- 每天 0 点（`TIMEZONE` 时区）自动开始新的计数，无需定时任务。
