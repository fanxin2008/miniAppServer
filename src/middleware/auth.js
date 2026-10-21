import jwt from 'jsonwebtoken';
import config from '../config.js';
import { findUserById } from '../services/users.js';
import { forbidden, unauthorized } from '../lib/httpError.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      throw unauthorized();
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      throw unauthorized();
    }

    const userId = payload.sub || payload.userId;
    if (!userId) {
      throw unauthorized();
    }

    const user = await findUserById(userId);
    if (!user) {
      throw unauthorized();
    }
    if (Number(user.status) === 3) {
      throw forbidden('ACCOUNT_BANNED', '账号已被封禁');
    }

    req.user = user;
    req.userId = String(user.id);
    next();
  } catch (err) {
    next(err);
  }
}
