import db from '../db.js';

const SCOPES = ['national', 'province', 'city'];

export function normalizeScope(scope) {
  const value = String(scope || 'national');
  return SCOPES.includes(value) ? value : null;
}

function regionFilter(scope, region) {
  if (scope === 'province') {
    return { clause: 'AND b.province_code = ?', params: [region.provinceCode] };
  }
  if (scope === 'city') {
    return { clause: 'AND b.city_code = ?', params: [region.cityCode] };
  }
  return { clause: '', params: [] };
}

async function countPlayers(scope, region) {
  const filter = regionFilter(scope, region);
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM user_best_records b
     JOIN users u ON u.id = b.user_id
     WHERE u.status = 1 ${filter.clause}`,
    filter.params
  );
  return Number(rows[0].total);
}

export async function listLeaderboard({ scope, limit, offset, region }) {
  const filter = regionFilter(scope, region);
  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM user_best_records b
     JOIN users u ON u.id = b.user_id
     WHERE u.status = 1 ${filter.clause}`,
    filter.params
  );

  const [rows] = await db.execute(
    `SELECT b.user_id, u.nickname, b.city_name, b.best_time_ms
     FROM user_best_records b
     JOIN users u ON u.id = b.user_id
     WHERE u.status = 1 ${filter.clause}
     ORDER BY b.best_time_ms ASC, b.achieved_at ASC, b.user_id ASC
     LIMIT ? OFFSET ?`,
    [...filter.params, limit, offset]
  );

  return {
    totalPlayers: Number(countRows[0].total),
    items: rows.map((row, index) => ({
      rank: offset + index + 1,
      userId: String(row.user_id),
      nickname: row.nickname,
      cityName: row.city_name,
      bestTimeMs: Number(row.best_time_ms),
    })),
  };
}

async function rankOfBest(best, scope) {
  if (!best) {
    return null;
  }
  const params = [
    Number(best.best_time_ms),
    Number(best.best_time_ms),
    best.achieved_at,
    Number(best.best_time_ms),
    best.achieved_at,
    String(best.user_id),
  ];
  let regionClause = '';
  if (scope === 'province') {
    if (best.province_code === null || best.province_code === undefined) {
      return null;
    }
    regionClause = 'AND b.province_code = ?';
    params.push(best.province_code);
  }
  if (scope === 'city') {
    if (best.city_code === null || best.city_code === undefined) {
      return null;
    }
    regionClause = 'AND b.city_code = ?';
    params.push(best.city_code);
  }

  const [rows] = await db.execute(
    `SELECT COUNT(*) + 1 AS rank_no
     FROM user_best_records b
     JOIN users u ON u.id = b.user_id
     WHERE u.status = 1
       AND (
         b.best_time_ms < ?
         OR (b.best_time_ms = ? AND b.achieved_at < ?)
         OR (b.best_time_ms = ? AND b.achieved_at = ? AND b.user_id < ?)
       )
       ${regionClause}`,
    params
  );
  return Number(rows[0].rank_no);
}

export async function getMyRanking(userId, userStatus, scope) {
  const [bestRows] = await db.execute(
    'SELECT user_id, best_time_ms, province_code, province_name, city_code, city_name, achieved_at FROM user_best_records WHERE user_id = ?',
    [userId]
  );
  const best = bestRows[0] || null;

  if (!best) {
    return { hasRecord: false, scope, rank: null, totalPlayers: 0, bestTimeMs: null };
  }

  const rankingBanned = Number(userStatus) === 2;
  const eligible = Number(userStatus) === 1;
  const region = {
    provinceCode: best.province_code,
    provinceName: best.province_name,
    cityCode: best.city_code,
    cityName: best.city_name,
  };

  let totalPlayers = 0;
  let rank = null;
  if (eligible) {
    totalPlayers = await countPlayers(scope, region);
    rank = await rankOfBest(best, scope);
  }

  return {
    hasRecord: true,
    scope,
    rank: rankingBanned ? null : rank,
    totalPlayers,
    bestTimeMs: Number(best.best_time_ms),
  };
}

export async function computeRanks(best) {
  const [national, province, city] = await Promise.all([
    rankOfBest(best, 'national'),
    rankOfBest(best, 'province'),
    rankOfBest(best, 'city'),
  ]);
  return { nationalRank: national, provinceRank: province, cityRank: city };
}
