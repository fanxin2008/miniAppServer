import express from 'express';
import crypto from 'node:crypto';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import challengesRouter from './routes/challenges.js';
import recordsRouter from './routes/records.js';
import leaderboardsRouter from './routes/leaderboards.js';
import { HttpError } from './lib/httpError.js';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(express.json());

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/records', recordsRouter);
app.use('/api/leaderboards', leaderboardsRouter);

app.use((req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: '接口不存在',
    requestId: req.id,
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      requestId: req.id,
    });
  }

  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({
      code: 'INVALID_JSON',
      message: '请求体不是合法的 JSON',
      requestId: req.id,
    });
  }

  console.error('[error]', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: '服务器内部错误',
    requestId: req.id,
  });
});

export default app;
