import config from '../config.js';
import db from '../db.js';

function todayInTimezone() {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.timezone });
}

function buildStatus(record) {
  const total = config.dailyPlayLimit;
  const used = Number(record.plays);
  return {
    date: record.date,
    total,
    used,
    remaining: Math.max(total - used, 0),
    visits: Number(record.visits),
  };
}

async function ensureRecord(openid, date) {
  await db.execute(
    'INSERT IGNORE INTO game_records (openid, date, visits, plays, updated_at) VALUES (?, ?, 0, 0, NOW())',
    [openid, date]
  );
}

export async function getStatus(openid) {
  const date = todayInTimezone();
  await ensureRecord(openid, date);
  const [rows] = await db.execute(
    'SELECT date, visits, plays FROM game_records WHERE openid = ? AND date = ?',
    [openid, date]
  );
  return buildStatus(rows[0]);
}

export async function recordVisit(openid) {
  const date = todayInTimezone();
  await ensureRecord(openid, date);
  await db.execute(
    'UPDATE game_records SET visits = visits + 1, updated_at = NOW() WHERE openid = ? AND date = ?',
    [openid, date]
  );
  return getStatus(openid);
}

export async function recordPlay(openid) {
  const date = todayInTimezone();
  await ensureRecord(openid, date);

  const [result] = await db.execute(
    'UPDATE game_records SET plays = plays + 1, updated_at = NOW() WHERE openid = ? AND date = ? AND plays < ?',
    [openid, date, config.dailyPlayLimit]
  );

  if (result.affectedRows === 0) {
    const err = new Error('今日游戏次数已用完');
    err.status = 429;
    err.code = 'NO_REMAINING';
    throw err;
  }

  return getStatus(openid);
}
