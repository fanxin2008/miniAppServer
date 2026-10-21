import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { code2Session } from '../services/wechat.js';
import { createUser, findUserByOpenid, serializeUser } from '../services/users.js';
import { badRequest } from '../lib/httpError.js';

const router = Router();

router.post('/wechat-login', async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      throw badRequest('INVALID_PARAMETER', '缺少 code');
    }

    let session;
    try {
      session = await code2Session(code);
    } catch (err) {
      if (err.status) {
        throw badRequest('WECHAT_LOGIN_FAILED', err.message);
      }
      throw err;
    }

    const openid = session.openid;
    let user = await findUserByOpenid(openid);
    if (!user) {
      try {
        user = await createUser(openid);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          user = await findUserByOpenid(openid);
        } else {
          throw err;
        }
      }
    }

    const accessToken = jwt.sign({ sub: String(user.id) }, config.jwt.secret, {
      expiresIn: config.jwt.expiresInSeconds,
    });

    res.json({
      accessToken,
      expiresInSeconds: config.jwt.expiresInSeconds,
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
