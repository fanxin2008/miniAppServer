import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { publishRecord, getMyBest } from '../services/record.js';
import { badRequest } from '../lib/httpError.js';

const router = Router();

router.use(requireAuth);

router.post('/publish', async (req, res, next) => {
  try {
    const body = req.body || {};
    const attemptId = body.attemptId;
    if (attemptId === undefined || attemptId === null || !/^\d+$/.test(String(attemptId))) {
      throw badRequest('INVALID_PARAMETER', 'attemptId 格式不正确');
    }
    const nickname = body.nickname;
    res.json(await publishRecord(req.userId, String(attemptId), nickname));
  } catch (err) {
    next(err);
  }
});

router.get('/me/best', async (req, res, next) => {
  try {
    res.json(await getMyBest(req.userId));
  } catch (err) {
    next(err);
  }
});

export default router;
