import jwt from 'jsonwebtoken';
import config from '../config.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ code: 401, message: '缺少登录凭证' });
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.openid = payload.openid;
    next();
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
}
