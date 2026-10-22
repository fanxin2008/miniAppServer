import 'dotenv/config';

const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  wechat: {
    appid: process.env.WECHAT_APPID || '',
    secret: process.env.WECHAT_SECRET || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'please_change_me_to_a_long_random_string',
    expiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS || 7200),
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'shache',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
  ip2region: {
    ipv4Db: process.env.IP2REGION_IPV4_DB || '',
    ipv6Db: process.env.IP2REGION_IPV6_DB || '',
    disableIpv6: process.env.IP2REGION_DISABLE_IPV6 === 'true',
  },
  dailyLimit: Number(process.env.DAILY_CHALLENGE_LIMIT || process.env.DAILY_PLAY_LIMIT || 10),
  sessionTtlSeconds: Number(process.env.CHALLENGE_SESSION_TTL_SECONDS || 180),
  timezone: process.env.TIMEZONE || 'Asia/Shanghai',
};

if (!config.wechat.appid || !config.wechat.secret) {
  console.warn('[config] WECHAT_APPID / WECHAT_SECRET 未配置，登录接口暂不可用。');
}

if (!config.db.password) {
  console.warn('[config] DB_PASSWORD 未配置，数据库连接将失败。');
}

export default config;
