import app from './app.js';
import config from './config.js';
import { initDatabase } from './db.js';

try {
  await initDatabase();
} catch (err) {
  console.error('[db] 数据库初始化失败，请检查 DB_* 配置。', err.message);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`[shache-server] listening on http://127.0.0.1:${config.port}`);
});
