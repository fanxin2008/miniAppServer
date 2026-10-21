import db from '../db.js';
import { badRequest } from '../lib/httpError.js';

const RESERVED_NICKNAMES = [
  '官方',
  '管理员',
  '客服',
  '系统',
  'admin',
  'administrator',
  'official',
];

export function validateNickname(nickname) {
  if (typeof nickname !== 'string') {
    throw badRequest('INVALID_PARAMETER', '昵称必须是字符串');
  }
  const trimmed = nickname.trim();
  const chars = Array.from(trimmed);
  if (chars.length < 1 || chars.length > 16) {
    throw badRequest('NICKNAME_INVALID', '昵称需为 1-16 个字符');
  }
  for (const ch of chars) {
    const code = ch.codePointAt(0);
    if ((code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f) || code === 0x200b) {
      throw badRequest('NICKNAME_INVALID', '昵称包含非法字符');
    }
  }
  const lower = trimmed.toLocaleLowerCase();
  if (RESERVED_NICKNAMES.some((word) => lower.includes(word))) {
    throw badRequest('NICKNAME_INVALID', '昵称不可使用官方或管理名称');
  }
  return trimmed;
}

export async function findUserByOpenid(openid) {
  const [rows] = await db.execute('SELECT id, openid, nickname, status FROM users WHERE openid = ?', [openid]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const [rows] = await db.execute('SELECT id, openid, nickname, status FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function createUser(openid) {
  const [result] = await db.execute(
    'INSERT INTO users (openid, nickname, status) VALUES (?, NULL, 1)',
    [openid]
  );
  return findUserById(result.insertId);
}

export function serializeUser(user) {
  return {
    id: String(user.id),
    nickname: user.nickname,
    status: Number(user.status),
  };
}
