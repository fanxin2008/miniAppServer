import express from 'express';
import authRouter from './routes/auth.js';
import gameRouter from './routes/game.js';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'up' } });
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
