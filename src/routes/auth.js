import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import db from '../db.js';
import { code2Session } from '../services/wechat.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { code } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ code: 400, message: '缺少 code' });
    }

    const session = await code2Session(code);
    const openid = session.openid;
    const unionid = session.unionid || null;

    const [existing] = await db.execute('SELECT openid FROM users WHERE openid = ?', [openid]);
    let isNewUser = false;

    if (existing.length > 0) {
      await db.execute('UPDATE users SET unionid = ?, last_login_at = NOW() WHERE openid = ?', [
        unionid,
        openid,
      ]);
    } else {
      isNewUser = true;
      await db.execute(
        'INSERT INTO users (openid, unionid, created_at, last_login_at) VALUES (?, ?, NOW(), NOW())',
        [openid, unionid]
      );
    }

    const token = jwt.sign({ openid }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.json({ code: 0, message: 'ok', data: { token, isNewUser } });
  } catch (err) {
    next(err);
  }
});

export default router;
