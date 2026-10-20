import express from 'express';
import authRouter from './routes/auth.js';
import gameRouter from './routes/game.js';
import { pingDatabase } from './db.js';

const app = express();

app.use(express.json());

app.get('/health', async (req, res) => {
  const dbUp = await pingDatabase();
  const healthy = dbUp;

  res.status(healthy ? 200 : 503).json({
    code: healthy ? 0 : 503,
    message: healthy ? 'ok' : '数据库不可用',
    data: {
      status: healthy ? 'up' : 'degraded',
      db: healthy ? 'up' : 'down',
    },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/game', gameRouter);

app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json({
    code: status,
    message: err.message || '服务器内部错误',
    data: null,
  });
});

export default app;
