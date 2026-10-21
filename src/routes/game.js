import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getStatus, recordVisit, recordPlay } from '../services/game.js';

const router = Router();

function parseScore(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0) {
    return null;
  }
  return Math.floor(score);
}

router.use(requireAuth);

router.get('/status', async (req, res, next) => {
  try {
    res.json({ code: 0, message: 'ok', data: await getStatus(req.openid) });
  } catch (err) {
    next(err);
  }
});

router.post('/visit', async (req, res, next) => {
  try {
    res.json({ code: 0, message: 'ok', data: await recordVisit(req.openid) });
  } catch (err) {
    next(err);
  }
});

router.post('/play', async (req, res, next) => {
  try {
    res.json({ code: 0, message: 'ok', data: await recordPlay(req.openid, parseScore(req.body && req.body.score)) });
  } catch (err) {
    next(err);
  }
});

export default router;
