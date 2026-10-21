import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeUser, validateNickname } from '../services/users.js';

const router = Router();

router.use(requireAuth);

router.get('/me', async (req, res, next) => {
  try {
    res.json(serializeUser(req.user));
  } catch (err) {
    next(err);
  }
});

router.patch('/me', async (req, res, next) => {
  try {
    const nickname = validateNickname(req.body && req.body.nickname);
    await db.execute(
      "UPDATE users SET nickname = ?, nickname_updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
      [nickname, req.user.id]
    );
    res.json({
      id: String(req.user.id),
      nickname,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
