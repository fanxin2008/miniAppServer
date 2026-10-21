import crypto from 'node:crypto';
import db, { withTransaction } from '../db.js';
import config from '../config.js';
import { todayInTimezone, toIso, resetAtUtcIso } from '../lib/time.js';
import { conflict, forbidden, gone, notFound } from '../lib/httpError.js';

const SESSION_STATUS_TEXT = {
  0: 'ONGOING',
  1: 'SUBMITTED',
  2: 'EXPIRED',
  3: 'ABANDONED',
};

const PUBLISH_STATUS_TEXT = {
  0: 'NOT_ELIGIBLE',
  1: 'PENDING',
  2: 'PUBLISHED',
  3: 'DECLINED',
};

async function getRemaining(conn, userId, quotaDate) {
  const [rows] = await conn.execute(
    'SELECT daily_limit, used_count FROM challenge_daily_quotas WHERE user_id = ? AND quota_date = ?',
    [userId, quotaDate]
  );
  if (rows.length === 0) {
    return config.dailyLimit;
  }
  return Math.max(Number(rows[0].daily_limit) - Number(rows[0].used_count), 0);
}

function sessionDisplayStatus(session) {
  if (Number(session.status) === 0) {
    const expiresAtMs = Date.parse(toIso(session.expires_at));
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return 'EXPIRED';
    }
  }
  return SESSION_STATUS_TEXT[Number(session.status)] || SESSION_STATUS_TEXT[0];
}

function buildStartResponse(session, remaining, statusCode = 200) {
  const body = {
    sessionId: session.id,
    status: sessionDisplayStatus(session),
    startedAt: toIso(session.started_at),
    expiresAt: toIso(session.expires_at),
    remainingCount: remaining,
  };
  return { statusCode, body };
}

export async function getQuota(userId) {
  const quotaDate = todayInTimezone();
  const [rows] = await db.execute(
    'SELECT quota_date, daily_limit, used_count FROM challenge_daily_quotas WHERE user_id = ? AND quota_date = ?',
    [userId, quotaDate]
  );
  const row = rows[0];
  const dailyLimit = row ? Number(row.daily_limit) : config.dailyLimit;
  const usedCount = row ? Number(row.used_count) : 0;
  return {
    quotaDate,
    dailyLimit,
    usedCount,
    remainingCount: Math.max(dailyLimit - usedCount, 0),
    resetAt: resetAtUtcIso(quotaDate),
  };
}

export async function startChallenge(userId, requestId) {
  return withTransaction(async (conn) => {
    const [userRows] = await conn.execute('SELECT id, status FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = userRows[0];
    if (!user) {
      throw notFound('USER_NOT_FOUND', '用户不存在');
    }
    if (Number(user.status) === 3) {
      throw forbidden('ACCOUNT_BANNED', '账号已被封禁');
    }

    const [existingSessions] = await conn.execute(
      'SELECT id, quota_date, status, started_at, expires_at FROM challenge_sessions WHERE user_id = ? AND request_id = ?',
      [userId, requestId]
    );
    if (existingSessions.length > 0) {
      const session = existingSessions[0];
      const remaining = await getRemaining(conn, userId, session.quota_date);
      return buildStartResponse(session, remaining, 200);
    }

    const quotaDate = todayInTimezone();
    await conn.execute(
      'INSERT IGNORE INTO challenge_daily_quotas (user_id, quota_date, daily_limit, used_count) VALUES (?, ?, ?, 0)',
      [userId, quotaDate, config.dailyLimit]
    );

    const [update] = await conn.execute(
      'UPDATE challenge_daily_quotas SET used_count = used_count + 1 WHERE user_id = ? AND quota_date = ? AND used_count < daily_limit',
      [userId, quotaDate]
    );
    if (update.affectedRows === 0) {
      throw conflict('QUOTA_EXHAUSTED', '今日挑战次数已用完');
    }

    const sessionId = crypto.randomUUID();
    const ttlSeconds = Number.isInteger(config.sessionTtlSeconds) && config.sessionTtlSeconds > 0
      ? config.sessionTtlSeconds
      : 180;
    await conn.execute(
      `INSERT INTO challenge_sessions
        (id, user_id, quota_date, request_id, status, started_at, expires_at, created_at)
       VALUES (?, ?, ?, ?, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) + INTERVAL ${ttlSeconds} SECOND, UTC_TIMESTAMP(3))`,
      [sessionId, userId, quotaDate, requestId]
    );

    const [sessionRows] = await conn.execute(
      'SELECT id, quota_date, status, started_at, expires_at FROM challenge_sessions WHERE id = ?',
      [sessionId]
    );
    const remaining = await getRemaining(conn, userId, quotaDate);
    return buildStartResponse(sessionRows[0], remaining, 201);
  });
}

function samePayload(attempt, payload) {
  return (
    Number(attempt.total_time_ms) === payload.totalTimeMs &&
    Number(attempt.reaction_time_ms) === payload.reactionTimeMs &&
    Number(attempt.brake_duration_ms) === payload.brakeDurationMs &&
    Number(attempt.entry_speed_milli_kmh) === payload.entrySpeedMilliKmh &&
    Number(attempt.max_brake_force_n) === payload.maxBrakeForceN &&
    (payload.brakingDistanceMm === null
      ? attempt.braking_distance_mm === null
      : Number(attempt.braking_distance_mm) === payload.brakingDistanceMm)
  );
}

function buildSubmitResponse(attempt, bestRow, remaining) {
  const isCandidate = Number(attempt.publish_status) === 1;
  return {
    attemptId: String(attempt.id),
    result: {
      totalTimeMs: Number(attempt.total_time_ms),
      reactionTimeMs: Number(attempt.reaction_time_ms),
      entrySpeedMilliKmh: Number(attempt.entry_speed_milli_kmh),
      maxBrakeForceN: Number(attempt.max_brake_force_n),
      brakingDistanceMm: attempt.braking_distance_mm === null ? null : Number(attempt.braking_distance_mm),
    },
    personalBest: {
      isCandidate,
      publishedBestTimeMs: bestRow ? Number(bestRow.best_time_ms) : null,
      candidateBestTimeMs: Number(attempt.total_time_ms),
      publishStatus: PUBLISH_STATUS_TEXT[Number(attempt.publish_status)] || PUBLISH_STATUS_TEXT[0],
    },
    remainingCount: remaining,
    nextAction: isCandidate ? 'PUBLISH_RECORD' : 'SHOW_RESULT',
  };
}

export async function submitChallenge(userId, payload, region) {
  return withTransaction(async (conn) => {
    const [userRows] = await conn.execute('SELECT id, status FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = userRows[0];
    if (!user) {
      throw notFound('USER_NOT_FOUND', '用户不存在');
    }
    if (Number(user.status) === 3) {
      throw forbidden('ACCOUNT_BANNED', '账号已被封禁');
    }

    const [sessionRows] = await conn.execute(
      'SELECT id, user_id, quota_date, status, expires_at FROM challenge_sessions WHERE id = ? AND user_id = ? FOR UPDATE',
      [payload.sessionId, userId]
    );
    if (sessionRows.length === 0) {
      throw notFound('SESSION_NOT_FOUND', '挑战会话不存在');
    }
    const session = sessionRows[0];

    if (Number(session.status) === 1) {
      const [attemptRows] = await conn.execute(
        'SELECT * FROM challenge_attempts WHERE session_id = ?',
        [session.id]
      );
      const attempt = attemptRows[0];
      if (!attempt || !samePayload(attempt, payload)) {
        throw conflict('SESSION_ALREADY_SUBMITTED', '该挑战已提交过不同成绩');
      }
      const [bestRows] = await conn.execute(
        'SELECT best_time_ms FROM user_best_records WHERE user_id = ?',
        [userId]
      );
      const remaining = await getRemaining(conn, userId, session.quota_date);
      return { created: false, body: buildSubmitResponse(attempt, bestRows[0] || null, remaining) };
    }

    if (Number(session.status) === 2) {
      throw gone('SESSION_EXPIRED', '挑战会话已过期');
    }
    if (Number(session.status) === 3) {
      throw gone('SESSION_ABANDONED', '挑战会话已放弃');
    }

    const expiresAtMs = Date.parse(toIso(session.expires_at));
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      throw gone('SESSION_EXPIRED', '挑战会话已过期');
    }

    const [bestRows] = await conn.execute(
      'SELECT best_time_ms FROM user_best_records WHERE user_id = ?',
      [userId]
    );
    const bestRow = bestRows[0] || null;
    const isCandidate = !bestRow || payload.totalTimeMs < Number(bestRow.best_time_ms);

    const [insert] = await conn.execute(
      `INSERT INTO challenge_attempts
        (user_id, session_id, total_time_ms, reaction_time_ms, brake_duration_ms,
         entry_speed_milli_kmh, max_brake_force_n, braking_distance_mm,
         province_code, province_name, city_code, city_name,
         is_valid, publish_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, UTC_TIMESTAMP(3))`,
      [
        userId,
        session.id,
        payload.totalTimeMs,
        payload.reactionTimeMs,
        payload.brakeDurationMs,
        payload.entrySpeedMilliKmh,
        payload.maxBrakeForceN,
        payload.brakingDistanceMm,
        region ? region.provinceCode : null,
        region ? region.provinceName : null,
        region ? region.cityCode : null,
        region ? region.cityName : null,
        isCandidate ? 1 : 0,
      ]
    );

    await conn.execute(
      'UPDATE challenge_sessions SET status = 1, submitted_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [session.id]
    );

    const [attemptRows] = await conn.execute('SELECT * FROM challenge_attempts WHERE id = ?', [insert.insertId]);
    const remaining = await getRemaining(conn, userId, session.quota_date);
    return { created: true, body: buildSubmitResponse(attemptRows[0], bestRow, remaining) };
  });
}

export async function getAttemptResult(userId, attemptId) {
  const [attemptRows] = await db.execute(
    'SELECT * FROM challenge_attempts WHERE id = ? AND user_id = ?',
    [attemptId, userId]
  );
  if (attemptRows.length === 0) {
    throw notFound('ATTEMPT_NOT_FOUND', '成绩不存在');
  }
  const attempt = attemptRows[0];

  const [bestRows] = await db.execute(
    'SELECT attempt_id, best_time_ms FROM user_best_records WHERE user_id = ?',
    [userId]
  );
  const best = bestRows[0] || null;

  const quotaDate = todayInTimezone();
  const [quotaRows] = await db.execute(
    'SELECT daily_limit, used_count FROM challenge_daily_quotas WHERE user_id = ? AND quota_date = ?',
    [userId, quotaDate]
  );
  const dailyLimit = quotaRows[0] ? Number(quotaRows[0].daily_limit) : config.dailyLimit;
  const usedCount = quotaRows[0] ? Number(quotaRows[0].used_count) : 0;

  return {
    attemptId: String(attempt.id),
    result: {
      title: '安全刹停',
      totalTimeMs: Number(attempt.total_time_ms),
      reactionTimeMs: Number(attempt.reaction_time_ms),
      entrySpeedMilliKmh: Number(attempt.entry_speed_milli_kmh),
      maxBrakeForceN: Number(attempt.max_brake_force_n),
    },
    publishStatus: PUBLISH_STATUS_TEXT[Number(attempt.publish_status)] || PUBLISH_STATUS_TEXT[0],
    isCurrentPersonalBest: best !== null && String(best.attempt_id) === String(attempt.id),
    personalBestTimeMs: best ? Number(best.best_time_ms) : null,
    rankingSnapshot: {
      nationalRank: attempt.rank_national_snapshot === null ? null : Number(attempt.rank_national_snapshot),
      provinceRank: attempt.rank_province_snapshot === null ? null : Number(attempt.rank_province_snapshot),
      cityRank: attempt.rank_city_snapshot === null ? null : Number(attempt.rank_city_snapshot),
    },
    remainingCount: Math.max(dailyLimit - usedCount, 0),
  };
}
