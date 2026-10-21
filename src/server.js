import app from './app.js';
import config from './config.js';
import { initDatabase } from './db.js';

try {
  await initDatabase();
} catch (err) {
  console.error('[db] 数据库初始化失败，请检查 DB_* 配置。', {
    time: new Date().toISOString(),
    message: err.message,
    code: err.code,
    errno: err.errno,
    sqlState: err.sqlState,
    sqlMessage: err.sqlMessage,
  });
  process.exit(1);
}

app.listen(config.port, config.host, () => {
  console.log(`[shache-server] listening on http://${config.host}:${config.port}`, new Date().toISOString());
});
