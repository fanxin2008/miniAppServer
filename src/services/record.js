import db, { withTransaction } from '../db.js';
import config from '../config.js';
import { todayInTimezone, toIso } from '../lib/time.js';
import { validateNickname } from './users.js';
import { computeRanks } from './leaderboard.js';
import { conflict, forbidden, notFound, unprocessable, badRequest } from '../lib/httpError.js';

function formatSeconds(totalTimeMs) {
  return (totalTimeMs / 1000).toFixed(3);
}

function buildPageData(attempt, best, ranking, remaining) {
  const personalBestTimeMs = best ? Number(best.best_time_ms) : Number(attempt.total_time_ms);
  const nationalRank = ranking ? ranking.nationalRank : null;
  return {
    title: '安全刹停',
    totalTimeMs: Number(attempt.total_time_ms),
    reactionTimeMs: Number(attempt.reaction_time_ms),
    entrySpeedMilliKmh: Number(attempt.entry_speed_milli_kmh),
    maxBrakeForceN: Number(attempt.max_brake_force_n),
    personalBestTimeMs,
    ranking: {
      nationalRank,
      provinceRank: ranking ? ranking.provinceRank : null,
      cityRank: ranking ? ranking.cityRank : null,
    },
    remainingCount: remaining,
    displayMessage: nationalRank
      ? `个人纪录已更新 · ${formatSeconds(Number(attempt.total_time_ms))} 秒 · 全国第 ${nationalRank} 名`
      : `个人纪录已更新 · ${formatSeconds(Number(attempt.total_time_ms))} 秒`,
  };
}

export async function publishRecord(userId, attemptId, nicknameInput) {
  const attempt = await withTransaction(async (conn) => {
    const [userRows] = await conn.execute(
      'SELECT id, nickname, status FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    const user = userRows[0];
    if (!user) {
      throw notFound('USER_NOT_FOUND', '用户不存在');
    }
    if (Number(user.status) === 3) {
      throw forbidden('ACCOUNT_BANNED', '账号已被封禁');
    }

    let nickname = user.nickname;
    if (nicknameInput !== undefined && nicknameInput !== null && nicknameInput !== '') {
      nickname = validateNickname(nicknameInput);
      await conn.execute(
        "UPDATE users SET nickname = ?, nickname_updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
        [nickname, userId]
      );
    } else if (!nickname) {
      throw badRequest('NICKNAME_REQUIRED', '请先设置昵称');
    }

    const [attemptRows] = await conn.execute(
      'SELECT * FROM challenge_attempts WHERE id = ? AND user_id = ? FOR UPDATE',
      [attemptId, userId]
    );
    if (attemptRows.length === 0) {
      throw notFound('ATTEMPT_NOT_FOUND', '成绩不存在');
    }
    const lockedAttempt = attemptRows[0];

    if (Number(lockedAttempt.publish_status) === 2) {
      const [bestRows] = await conn.execute(
        'SELECT * FROM user_best_records WHERE user_id = ?',
        [userId]
      );
      const remaining = await getRemaining(conn, userId);
      return {
        attempt: lockedAttempt,
        best: bestRows[0] || null,
        ranking: {
          nationalRank: lockedAttempt.rank_national_snapshot === null ? null : Number(lockedAttempt.rank_national_snapshot),
          provinceRank: lockedAttempt.rank_province_snapshot === null ? null : Number(lockedAttempt.rank_province_snapshot),
          cityRank: lockedAttempt.rank_city_snapshot === null ? null : Number(lockedAttempt.rank_city_snapshot),
        },
        remaining,
        alreadyPublished: true,
      };
    }

    if (Number(lockedAttempt.is_valid) !== 1) {
      throw unprocessable('INVALID_ATTEMPT', '该成绩已被判定为无效');
    }
    if (Number(lockedAttempt.publish_status) !== 1) {
      throw conflict('ATTEMPT_NOT_PENDING', '该成绩当前不可发布');
    }

    const [bestRows] = await conn.execute(
      'SELECT * FROM user_best_records WHERE user_id = ?',
      [userId]
    );
    const currentBest = bestRows[0] || null;

    if (currentBest && Number(currentBest.best_time_ms) <= Number(lockedAttempt.total_time_ms)) {
      throw conflict('NOT_A_NEW_BEST', '该成绩不是新的个人最好成绩');
    }

    if (currentBest) {
      await conn.execute(
        `UPDATE user_best_records
         SET attempt_id = ?, best_time_ms = ?, province_code = ?, province_name = ?, city_code = ?, city_name = ?,
             achieved_at = ?, published_at = UTC_TIMESTAMP(3)
         WHERE user_id = ?`,
        [
          lockedAttempt.id,
          lockedAttempt.total_time_ms,
          lockedAttempt.province_code,
          lockedAttempt.province_name,
          lockedAttempt.city_code,
          lockedAttempt.city_name,
          lockedAttempt.created_at,
          userId,
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO user_best_records
          (user_id, attempt_id, best_time_ms, province_code, province_name, city_code, city_name, achieved_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [
          userId,
          lockedAttempt.id,
          lockedAttempt.total_time_ms,
          lockedAttempt.province_code,
          lockedAttempt.province_name,
          lockedAttempt.city_code,
          lockedAttempt.city_name,
          lockedAttempt.created_at,
        ]
      );
    }

    await conn.execute(
      'UPDATE challenge_attempts SET publish_status = 2, published_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [lockedAttempt.id]
    );

    const [refreshedAttemptRows] = await conn.execute(
      'SELECT * FROM challenge_attempts WHERE id = ?',
      [lockedAttempt.id]
    );
    const [refreshedBestRows] = await conn.execute(
      'SELECT * FROM user_best_records WHERE user_id = ?',
      [userId]
    );
    const remaining = await getRemaining(conn, userId);

    return {
      attempt: refreshedAttemptRows[0],
      best: refreshedBestRows[0] || null,
      ranking: null,
      remaining,
      alreadyPublished: false,
    };
  });

  let ranking = attempt.ranking;
  if (!attempt.alreadyPublished) {
    try {
      ranking = await computeRanks(attempt.best);
      await db.execute(
        'UPDATE challenge_attempts SET rank_national_snapshot = ?, rank_province_snapshot = ?, rank_city_snapshot = ? WHERE id = ?',
        [ranking.nationalRank, ranking.provinceRank, ranking.cityRank, attempt.attempt.id]
      );
    } catch (err) {
      console.error('[records] 排名快照计算失败（不影响发布）', err);
      ranking = null;
    }
  }

  return {
    attemptId: String(attempt.attempt.id),
    recordPublished: true,
    isNewPersonalBest: !attempt.alreadyPublished || Boolean(attempt.best && Number(attempt.best.attempt_id) === Number(attempt.attempt.id)),
    pageData: buildPageData(attempt.attempt, attempt.best, ranking, attempt.remaining),
  };
}

async function getRemaining(conn, userId) {
  const quotaDate = todayInTimezone();
  const [rows] = await conn.execute(
    'SELECT daily_limit, used_count FROM challenge_daily_quotas WHERE user_id = ? AND quota_date = ?',
    [userId, quotaDate]
  );
  if (rows.length === 0) {
    return config.dailyLimit;
  }
  return Math.max(Number(rows[0].daily_limit) - Number(rows[0].used_count), 0);
}

export async function getMyBest(userId) {
  const [rows] = await db.execute(
    `SELECT b.attempt_id, b.best_time_ms, b.province_name, b.city_name, b.achieved_at,
            a.total_time_ms, a.reaction_time_ms, a.entry_speed_milli_kmh, a.max_brake_force_n
     FROM user_best_records b
     JOIN challenge_attempts a ON a.id = b.attempt_id AND a.user_id = b.user_id
     WHERE b.user_id = ?`,
    [userId]
  );

  if (rows.length === 0) {
    return { hasRecord: false, bestRecord: null };
  }

  const row = rows[0];
  return {
    hasRecord: true,
    bestRecord: {
      attemptId: String(row.attempt_id),
      totalTimeMs: Number(row.total_time_ms),
      reactionTimeMs: Number(row.reaction_time_ms),
      entrySpeedMilliKmh: Number(row.entry_speed_milli_kmh),
      maxBrakeForceN: Number(row.max_brake_force_n),
      provinceName: row.province_name,
      cityName: row.city_name,
      achievedAt: toIso(row.achieved_at),
    },
  };
}
